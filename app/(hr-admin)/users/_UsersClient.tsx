'use client'

import { TableScrollRegion } from '@/components/ui/TableScrollRegion'
import { useTransition, useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Inbox, MoreHorizontal, ShieldCheck, ShieldOff, Pencil, Search, X, KeyRound, History, ChevronDown, Check } from 'lucide-react'
import { updateUserRole, toggleUserStatus, updateUserAccount, setUserPassword } from '@/modules/auth/actions'
import { ALL_ROLES, type UserRow, type DepartmentOption } from '@/modules/auth/config'
import { formatDMY, formatDMYTime } from '@/lib/utils'
import { SortableHeader } from '@/components/ui/SortableHeader'
import { RecordHistoryDrawer } from '@/components/mdm/RecordHistoryDrawer'
import { useLocale } from '@/components/providers/LocaleProvider'
import { tk } from '@/lib/i18n-messages'
import type { SortDirection } from '@/hooks/useTableSort'

// ── Role pill ─────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN:   'Super Admin',
  HR_DIRECTOR:   'HR Director',
  HR_ADMIN:      'HR Admin',
  LINE_MANAGER:  'Line Manager',
  MANAGER:       'Line Manager',
  PAYROLL_ADMIN: 'Payroll Admin',
  FINANCE_ADMIN: 'Finance Admin',
  FINANCE:       'Finance',
  EMPLOYEE:      'Employee',
}

const ROLE_COLORS: Record<string, { bg: string; fg: string }> = {
  SUPER_ADMIN:   { bg: 'var(--status-rejected-bg)',  fg: 'var(--status-rejected-fg)'  },
  HR_DIRECTOR:   { bg: 'var(--status-pending-bg)',   fg: 'var(--status-pending-fg)'   },
  HR_ADMIN:      { bg: 'var(--status-approved-bg)',  fg: 'var(--status-approved-fg)'  },
  LINE_MANAGER:  { bg: 'var(--status-pending-bg)',   fg: 'var(--status-pending-fg)'   },
  MANAGER:       { bg: 'var(--status-pending-bg)',   fg: 'var(--status-pending-fg)'   },
  PAYROLL_ADMIN: { bg: 'var(--status-draft-bg)',     fg: 'var(--status-draft-fg)'     },
  FINANCE_ADMIN: { bg: 'var(--status-draft-bg)',     fg: 'var(--status-draft-fg)'     },
  FINANCE:       { bg: 'var(--status-draft-bg)',     fg: 'var(--status-draft-fg)'     },
  EMPLOYEE:      { bg: 'var(--surface)',              fg: 'var(--ink-2)'               },
}

function RolePill({ role }: { role: string }) {
  const c = ROLE_COLORS[role] ?? { bg: 'var(--surface)', fg: 'var(--ink-3)' }
  const label = ROLE_LABELS[role] ?? (ALL_ROLES.find(r => r.value === role)?.label ?? role)
  return (
    <span style={{
      display: 'inline-block', borderRadius: 999,
      padding: '2px 10px', fontSize: 'var(--text-caption)', fontWeight: 700,
      background: c.bg, color: c.fg,
      textTransform: 'uppercase', letterSpacing: '0.4px',
    }}>
      {label}
    </span>
  )
}

// ── Status dot ────────────────────────────────────────────────────────────────

function StatusDot({ active }: { active: boolean }) {
  const locale = useLocale()
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%',
        background: active ? 'var(--status-approved-dot)' : 'var(--ink-4)',
        flexShrink: 0,
      }} />
      <span style={{ fontSize: 'var(--text-caption)', color: active ? 'var(--status-approved-fg)' : 'var(--ink-3)', fontWeight: 500 }}>
        {active ? tk(locale, 'common.active') : tk(locale, 'common.inactive')}
      </span>
    </span>
  )
}

// ── Department searchable picker ──────────────────────────────────────────────

function DepartmentPicker({
  value,
  onChange,
  departments,
}: {
  value:       string | null
  onChange:    (id: string | null) => void
  departments: DepartmentOption[]
}) {
  const locale = useLocale()
  const [open,   setOpen]   = useState(false)
  const [query,  setQuery]  = useState('')
  const wrapRef  = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = departments.find(d => d.id === value) ?? null

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Focus search input when opening
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0)
    else setQuery('')
  }, [open])

  // Filter + group (inactive entries always shown at top in their own group)
  const q = query.toLowerCase()
  const filtered = q
    ? departments.filter(d =>
        (d.nameEn ?? '').toLowerCase().includes(q) ||
        (d.entityNameEn ?? '').toLowerCase().includes(q),
      )
    : departments

  const inactiveDepts = filtered.filter(d => d.isInactive)
  const activeDepts   = filtered.filter(d => !d.isInactive)

  const grouped = new Map<string, DepartmentOption[]>()
  for (const d of activeDepts) {
    const key = d.entityNameEn ?? '— No entity —'
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(d)
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 12px', borderRadius: 6, cursor: 'pointer',
          border: selected?.isInactive ? '1px solid #F59E0B' : '1px solid var(--border)',
          background: 'var(--card)',
          color: selected ? 'var(--ink-1)' : 'var(--ink-3)',
          fontSize: 'var(--text-body)', textAlign: 'left', gap: 8,
        }}
      >
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? (
            <>
              <span style={{ fontWeight: 600, color: selected.isInactive ? '#B45309' : 'var(--ink-1)' }}>{selected.nameEn}</span>
              {selected.isInactive && (
                <span style={{ color: '#B45309',
                marginLeft: 6, fontSize: 'var(--text-caption)', fontWeight: 600 }}>{locale === 'ar' ? '(غير نشط)' : '(inactive)'}</span>
              )}
              {!selected.isInactive && selected.entityNameEn && (
                <span style={{ color: 'var(--ink-3)',
                marginLeft: 6, fontSize: 'var(--text-caption)' }}>
                  {selected.entityNameEn}
                </span>
              )}
            </>
          ) : (locale === 'ar' ? '— بلا قسم —' : '— No department —')}
        </span>
        <ChevronDown size={13} style={{ flexShrink: 0, color: 'var(--ink-4)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', left: 0, right: 0, top: 'calc(100% + 4px)',
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          zIndex: 200, overflow: 'hidden',
        }}>
          {/* Search input */}
          <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Search size={13} style={{ color: 'var(--ink-4)', flexShrink: 0 }} />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={locale === 'ar' ? 'ابحث عن قسم أو جهة…' : 'Search department or entity…'}
              style={{
                flex: 1, border: 'none', outline: 'none', fontSize: 'var(--text-body)',
                background: 'transparent', color: 'var(--ink-1)',
              }}
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--ink-4)', display: 'flex' }}>
                <X size={12} />
              </button>
            )}
          </div>

          {/* Results */}
          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            {/* Clear option */}
            <button
              type="button"
              onClick={() => { onChange(null); setOpen(false) }}
              style={{
                width: '100%', textAlign: 'left', padding: '8px 12px',
                fontSize: 'var(--text-body)', cursor: 'pointer', border: 'none',
                background: value === null ? 'var(--accent-050)' : 'transparent',
                color: 'var(--ink-3)', display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              {value === null && <Check size={12} style={{ color: 'var(--brand-active)', flexShrink: 0 }} />}
              <span style={{ marginLeft: value === null ? 0 : 20 }}>{locale === 'ar' ? '— بلا قسم —' : '— No department —'}</span>
            </button>

            {inactiveDepts.length === 0 && grouped.size === 0 && (
              <div style={{ padding: '12px', fontSize: 'var(--text-caption)', color: 'var(--ink-4)', textAlign: 'center' }}>
                {locale === 'ar' ? `لا توجد أقسام مطابقة لـ "${query}"` : <>No departments match &ldquo;{query}&rdquo;</>}
              </div>
            )}

            {/* Inactive / current assignment group */}
            {inactiveDepts.length > 0 && (
              <div>
                <div style={{
                  padding: '6px 12px 3px',
                  fontSize: 'var(--text-caption)', fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.8px', color: '#B45309',
                  fontFamily: 'var(--font-mono)',
                  borderTop: '1px solid var(--border)',
                  marginTop: 2,
                }}>
                  {locale === 'ar' ? 'التعيين الحالي (غير نشط)' : 'Current assignment (inactive)'}
                </div>
                {inactiveDepts.map(d => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => { onChange(d.id); setOpen(false) }}
                    style={{
                      width: '100%', textAlign: 'left', padding: '7px 12px 7px 20px',
                      fontSize: 'var(--text-body)', cursor: 'pointer', border: 'none',
                      background: d.id === value ? '#FEF3C7' : 'transparent',
                      color: '#92400E', display: 'flex', alignItems: 'center', gap: 8,
                    }}
                    onMouseEnter={e => { if (d.id !== value) e.currentTarget.style.background = '#FEF9EE' }}
                    onMouseLeave={e => { e.currentTarget.style.background = d.id === value ? '#FEF3C7' : 'transparent' }}
                  >
                    {d.id === value
                      ? <Check size={12} style={{ color: '#B45309', flexShrink: 0 }} />
                      : <span style={{ width: 12, flexShrink: 0 }} />}
                    <span style={{ fontWeight: d.id === value ? 600 : 400 }}>{d.nameEn ?? d.id}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 'var(--text-caption)', fontWeight: 700, color: '#B45309' }}>{locale === 'ar' ? 'غير نشط' : 'inactive'}</span>
                  </button>
                ))}
              </div>
            )}

            {Array.from(grouped.entries()).map(([entity, depts]) => (
              <div key={entity}>
                {/* Entity group header */}
                <div style={{
                  padding: '6px 12px 3px',
                  fontSize: 'var(--text-caption)', fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.8px', color: 'var(--ink-4)',
                  fontFamily: 'var(--font-mono)',
                  borderTop: '1px solid var(--border)',
                  marginTop: 2,
                }}>
                  {entity}
                </div>
                {depts.map(d => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => { onChange(d.id); setOpen(false) }}
                    style={{
                      width: '100%', textAlign: 'left', padding: '7px 12px 7px 20px',
                      fontSize: 'var(--text-body)', cursor: 'pointer', border: 'none',
                      background: d.id === value ? 'var(--accent-050)' : 'transparent',
                      color: 'var(--ink-1)', display: 'flex', alignItems: 'center', gap: 8,
                    }}
                    onMouseEnter={e => { if (d.id !== value) e.currentTarget.style.background = 'var(--surface)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = d.id === value ? 'var(--accent-050)' : 'transparent' }}
                  >
                    {d.id === value
                      ? <Check size={12} style={{ color: 'var(--brand-active)', flexShrink: 0 }} />
                      : <span style={{ width: 12, flexShrink: 0 }} />}
                    <span style={{ fontWeight: d.id === value ? 600 : 400 }}>{d.nameEn ?? d.id}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Edit modal ────────────────────────────────────────────────────────────────

// Use shared utility — DD-Mon-YYYY HH:mm format
function fmtDate(iso: string | null | undefined): string {
  return formatDMYTime(iso ?? null)
}

function EditModal({
  row,
  currentUserRole,
  departments,
  onSave,
  onClose,
}: {
  row:             UserRow
  currentUserRole: string
  departments:     DepartmentOption[]
  onSave:          (accountId: string, email: string, role: string, isActive: boolean, departmentId: string | null) => void
  onClose:         () => void
}) {
  const locale = useLocale()
  const [email,        setEmail]        = useState(row.primaryEmail)
  const [role,         setRole]         = useState(row.avaniisRole)
  const [isActive,     setIsActive]     = useState(row.isActive)
  const [departmentId, setDepartmentId] = useState<string | null>(row.departmentId ?? null)

  // Inject current department if it's not in the active list (dept or entity is inactive)
  const effectiveDepts = useMemo<DepartmentOption[]>(() => {
    if (!row.departmentId) return departments
    if (departments.find(d => d.id === row.departmentId)) return departments
    return [
      { id: row.departmentId, nameEn: row.departmentNameEn ?? row.departmentId, entityNameEn: null, isInactive: true },
      ...departments,
    ]
  }, [departments, row.departmentId, row.departmentNameEn])

  const canSuperAdmin   = currentUserRole === 'SUPER_ADMIN'
  const assignableRoles = ALL_ROLES.filter(r => r.value !== 'SUPER_ADMIN' || canSuperAdmin)

  const fieldStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', fontSize: 'var(--text-body)',
    border: '1px solid var(--border)', borderRadius: 8,
    background: 'var(--surface)', color: 'var(--ink-1)',
    outline: 'none', boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 'var(--text-caption)', fontWeight: 700,
    color: 'var(--ink-3)', textTransform: 'uppercase',
    letterSpacing: '0.6px',
    marginBottom: 6,
  }
  const roStyle: React.CSSProperties = {
    ...fieldStyle, color: 'var(--ink-3)',
    background: 'var(--bg)', cursor: 'not-allowed',
  }

  return (
    <>
      {/* backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 99,
          background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(2px)',
        }}
      />
      <div style={{
        position: 'fixed', inset: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, pointerEvents: 'none',
        overflowY: 'auto',
      }}>
        <div
          onClick={e => e.stopPropagation()}
          style={{
            pointerEvents: 'auto',
            background: 'var(--card)', borderRadius: 14,
            border: '1px solid var(--border)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
            width: '100%', maxWidth: 500,
            margin: 'auto',
          }}
        >
          {/* ── Header ── */}
          <div style={{ padding: '24px 28px 0' }}>
            <div style={{ fontSize: 17, fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--ink-1)' }}>
              {locale === 'ar' ? 'تعديل المستخدم' : 'Edit User'}
            </div>
            <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)',
            marginTop: 3 }}>
              {locale === 'ar' ? 'معرّف الحساب:' : 'Account ID:'} <code style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)' }}>{row.accountId.slice(0, 8)}…</code>
            </div>
          </div>

          {/* ── Editable fields ── */}
          <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Name — read-only, managed via Employees module */}
            <div>
              <label style={labelStyle}>{locale === 'ar' ? 'الاسم الكامل' : 'Full Name'}</label>
              <input readOnly value={row.fullNameEn ?? '—'} style={roStyle} title={locale === 'ar' ? 'يُعدَّل الاسم من وحدة الموظفين' : 'Edit name via the Employees module'} />
              <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)',
              marginTop: 4 }}>
                {locale === 'ar'
                  ? <>تتم إدارة الاسم من وحدة <strong>الموظفين</strong></>
                  : <>Name is managed in the <strong>Employees</strong> module</>}
              </div>
            </div>

            {/* Department — searchable picker grouped by entity */}
            <div>
              <label style={labelStyle}>{locale === 'ar' ? 'القسم' : 'Department'}</label>
              <DepartmentPicker
                value={departmentId}
                onChange={setDepartmentId}
                departments={effectiveDepts}
              />
            </div>

            {/* Email — editable */}
            <div>
              <label style={labelStyle}>{locale === 'ar' ? 'بريد تسجيل الدخول' : 'Login Email'} <span style={{ color: 'var(--brand-active)' }}>*</span></label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                style={fieldStyle}
                autoFocus
              />
            </div>

            {/* Role — editable */}
            <div>
              <label style={labelStyle}>{locale === 'ar' ? 'دور النظام' : 'System Role'} <span style={{ color: 'var(--brand-active)' }}>*</span></label>
              <select
                value={role}
                onChange={e => setRole(e.target.value)}
                style={{ ...fieldStyle, cursor: 'pointer' }}
              >
                {assignableRoles.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>

            {/* Status toggle — editable */}
            <div>
              <label style={labelStyle}>{locale === 'ar' ? 'حالة الحساب' : 'Account Status'} <span style={{ color: 'var(--brand-active)' }}>*</span></label>
              <div style={{ display: 'flex', gap: 8 }}>
                {[true, false].map(val => (
                  <button
                    key={String(val)}
                    type="button"
                    onClick={() => setIsActive(val)}
                    style={{
                      flex: 1, padding: '9px 0', fontSize: 'var(--text-body)', fontWeight: 600,
                      borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s',
                      border: isActive === val ? 'none' : '1px solid var(--border)',
                      background: isActive === val
                        ? (val ? 'var(--status-approved-bg)' : 'var(--status-rejected-bg)')
                        : 'var(--surface)',
                      color: isActive === val
                        ? (val ? 'var(--status-approved-fg)' : 'var(--status-rejected-fg)')
                        : 'var(--ink-3)',
                    }}
                  >
                    {val ? `● ${tk(locale, 'common.active')}` : `○ ${tk(locale, 'common.inactive')}`}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── WHO / Audit panel ── */}
          <div style={{
            margin: '0 28px 20px',
            background: 'var(--surface)', borderRadius: 8,
            border: '1px solid var(--border)', padding: '12px 16px',
          }}>
            <div style={{ fontSize: 'var(--text-caption)', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.6px',
            marginBottom: 10 }}>
              {locale === 'ar' ? 'سجل التدقيق (أعمدة المنفِّذ)' : 'Audit Trail (WHO Columns)'}
            </div>
            <div data-responsive-grid="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px' }}>
              {[
                { label: locale === 'ar' ? 'أنشئ بواسطة'        : 'Created by',      value: row.createdByName },
                { label: locale === 'ar' ? 'أنشئ في'           : 'Created on',      value: fmtDate(row.createdDate) },
                { label: locale === 'ar' ? 'آخر تحديث بواسطة'   : 'Last updated by', value: row.updatedByName },
                { label: locale === 'ar' ? 'آخر تحديث في'      : 'Last updated on', value: fmtDate(row.updatedDate) },
                { label: locale === 'ar' ? 'آخر تسجيل دخول'    : 'Last login',      value: fmtDate(row.lastLoginAt) },
                { label: locale === 'ar' ? 'عدد مرات الدخول'    : 'Login count',     value: String(row.loginCount) },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
                  <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-2)', fontWeight: 500,
                  marginTop: 2 }}>{value ?? '—'}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Actions ── */}
          <div style={{
            display: 'flex', justifyContent: 'flex-end', gap: 10,
            padding: '0 28px 24px',
          }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '9px 20px', fontSize: 'var(--text-body)', fontWeight: 500,
                border: '1px solid var(--border)', borderRadius: 8,
                background: 'none', color: 'var(--ink-2)', cursor: 'pointer',
              }}
            >
              {tk(locale, 'common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => onSave(row.accountId, email, role, isActive, departmentId)}
              style={{
                padding: '9px 20px', fontSize: 'var(--text-body)', fontWeight: 600,
                border: 'none', borderRadius: 8,
                background: 'var(--accent)', color: 'var(--card)', cursor: 'pointer',
              }}
            >
              {locale === 'ar' ? 'حفظ التغييرات' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ── Change Password modal (SUPER_ADMIN only) ──────────────────────────────────

function ChangePasswordModal({
  row,
  onClose,
}: {
  row:     UserRow
  onClose: () => void
}) {
  const router = useRouter()
  const locale = useLocale()
  const [isPending, startTransition] = useTransition()
  const [password,    setPasswordVal] = useState('')
  const [confirmPwd,  setConfirmPwd]  = useState('')
  const [error,       setError]       = useState<string | null>(null)
  const [success,     setSuccess]     = useState(false)

  const mismatch = confirmPwd.length > 0 && password !== confirmPwd

  function handleSave() {
    setError(null)
    if (!password.trim())             { setError(locale === 'ar' ? 'لا يمكن أن تكون كلمة المرور فارغة.' : 'Password cannot be empty.'); return }
    if (password.trim().length < 8)   { setError(locale === 'ar' ? 'يجب أن تتكون كلمة المرور من ٨ أحرف على الأقل.' : 'Password must be at least 8 characters.'); return }
    if (password !== confirmPwd)      { setError(locale === 'ar' ? 'كلمتا المرور غير متطابقتين.' : 'Passwords do not match.'); return }

    startTransition(async () => {
      const res = await setUserPassword(row.accountId, password.trim())
      if (!res.success) {
        setError(res.error ?? (locale === 'ar' ? 'تعذّر تحديث كلمة المرور.' : 'Failed to update password.'))
      } else {
        setSuccess(true)
        setTimeout(() => { onClose(); router.refresh() }, 1200)
      }
    })
  }

  const fieldStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', fontSize: 'var(--text-body)',
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: "var(--border)",
    borderRightWidth: "1px",
    borderRightStyle: "solid",
    borderRightColor: "var(--border)",
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: "var(--border)",
    borderLeftWidth: "1px",
    borderLeftStyle: "solid",
    borderLeftColor: "var(--border)", borderRadius: 8,
    background: 'var(--surface)', color: 'var(--ink-1)',
    outline: 'none', boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 'var(--text-caption)', fontWeight: 700,
    color: 'var(--ink-3)', textTransform: 'uppercase',
    letterSpacing: '0.6px',
    marginBottom: 6,
  }

  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 99,
        background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(2px)',
      }} />
      <div style={{
        position: 'fixed', inset: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, pointerEvents: 'none',
      }}>
        <div
          onClick={e => e.stopPropagation()}
          style={{
            pointerEvents: 'auto',
            background: 'var(--card)', borderRadius: 14,
            border: '1px solid var(--border)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
            width: '100%', maxWidth: 420,
          }}
        >
          {/* Header */}
          <div style={{ padding: '24px 28px 0', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10, flexShrink: 0,
              background: 'var(--accent-100)', display: 'grid', placeItems: 'center',
              color: 'var(--brand-active)',
            }}>
              <KeyRound size={18} strokeWidth={2} />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--ink-1)' }}>
                {locale === 'ar' ? 'تغيير كلمة المرور' : 'Change Password'}
              </div>
              <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)',
              marginTop: 3 }}>
                {row.fullNameEn ?? row.primaryEmail} · {row.primaryEmail}
              </div>
            </div>
          </div>

          {/* Fields */}
          <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {success ? (
              <div style={{
                padding: '14px 16px', borderRadius: 8,
                background: 'var(--status-approved-bg)', color: 'var(--status-approved-fg)',
                fontSize: 'var(--text-body)', fontWeight: 600, textAlign: 'center',
              }}>
                ✓ {locale === 'ar' ? 'تم تحديث كلمة المرور بنجاح' : 'Password updated successfully'}
              </div>
            ) : (
              <>
                <div>
                  <label style={labelStyle}>{locale === 'ar' ? 'كلمة المرور الجديدة *' : 'New Password *'}</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPasswordVal(e.target.value)}
                    placeholder={locale === 'ar' ? '٨ أحرف على الأقل' : 'Min. 8 characters'}
                    style={fieldStyle}
                    autoComplete="new-password"
                    autoFocus
                  />
                </div>
                <div>
                  <label style={labelStyle}>{locale === 'ar' ? 'تأكيد كلمة المرور *' : 'Confirm Password *'}</label>
                  <input
                    type="password"
                    value={confirmPwd}
                    onChange={e => setConfirmPwd(e.target.value)}
                    placeholder={locale === 'ar' ? 'أعد إدخال كلمة المرور' : 'Repeat password'}
                    style={{
                      ...fieldStyle,
                      borderTopColor: mismatch ? 'var(--status-rejected-dot)' : 'var(--border)',
                      borderRightColor: mismatch ? 'var(--status-rejected-dot)' : 'var(--border)',
                      borderBottomColor: mismatch ? 'var(--status-rejected-dot)' : 'var(--border)',
                      borderLeftColor: mismatch ? 'var(--status-rejected-dot)' : 'var(--border)',
                    }}
                    autoComplete="new-password"
                    onKeyDown={e => e.key === 'Enter' && handleSave()}
                  />
                  {mismatch && (
                    <div style={{ fontSize: 'var(--text-caption)', color: 'var(--status-rejected-fg)',
                    marginTop: 4 }}>
                      {locale === 'ar' ? 'كلمتا المرور غير متطابقتين' : 'Passwords do not match'}
                    </div>
                  )}
                </div>
                {error && (
                  <div style={{
                    padding: '8px 12px', borderRadius: 7,
                    background: 'var(--status-rejected-bg)', color: 'var(--status-rejected-fg)',
                    fontSize: 'var(--text-caption)',
                  }}>
                    {error}
                  </div>
                )}
                <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', lineHeight: 1.5 }}>
                  {locale === 'ar'
                    ? 'سيؤدي ذلك إلى تعيين كلمة مرور محلية لهذا الحساب، ما يتيح تسجيل الدخول بالبريد الإلكتروني وكلمة المرور إضافةً إلى الدخول الموحّد (SSO).'
                    : 'This will set a local password for this account, allowing login with email + password in addition to SSO.'}
                </div>
              </>
            )}
          </div>

          {/* Actions */}
          {!success && (
            <div style={{
              display: 'flex', justifyContent: 'flex-end', gap: 10,
              padding: '0 28px 24px',
            }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '9px 20px', fontSize: 'var(--text-body)', fontWeight: 500,
                  border: '1px solid var(--border)', borderRadius: 8,
                  background: 'none', color: 'var(--ink-2)', cursor: 'pointer',
                }}
              >
                {tk(locale, 'common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isPending || mismatch}
                style={{
                  padding: '9px 20px', fontSize: 'var(--text-body)', fontWeight: 600,
                  border: 'none', borderRadius: 8,
                  background: 'var(--accent)', color: '#fff',
                  cursor: isPending ? 'wait' : 'pointer',
                  opacity: isPending || mismatch ? 0.65 : 1,
                }}
              >
                {isPending ? (locale === 'ar' ? 'جارٍ الحفظ…' : 'Saving…') : (locale === 'ar' ? 'تعيين كلمة المرور' : 'Set Password')}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ── Row menu ──────────────────────────────────────────────────────────────────

function RowMenu({
  row,
  currentUserRole,
  currentUserId,
  onRoleChange,
  onStatusToggle,
  onEdit,
  onChangePassword,
  onViewAudit,
}: {
  row:               UserRow
  currentUserRole:   string
  currentUserId:     string
  onRoleChange:      (accountId: string, role: string) => void
  onStatusToggle:    (accountId: string, activate: boolean) => void
  onEdit:            (row: UserRow) => void
  onChangePassword:  (row: UserRow) => void
  onViewAudit:       (row: UserRow) => void
}) {
  const locale = useLocale()
  const [open, setOpen] = useState(false)

  const isSelf      = row.accountId === currentUserId
  const canEdit     = !isSelf
  const canSuperAdmin = currentUserRole === 'SUPER_ADMIN'

  const assignableRoles = ALL_ROLES.filter(r =>
    r.value !== 'SUPER_ADMIN' || canSuperAdmin,
  )

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          background: 'none', border: '1px solid var(--border)',
          borderRadius: 6, cursor: 'pointer', padding: '4px 6px',
          color: 'var(--ink-3)', display: 'grid', placeItems: 'center',
          lineHeight: 0,
        }}
        aria-label={locale === 'ar' ? 'إجراءات الصف' : 'Row actions'}
      >
        <MoreHorizontal size={15} strokeWidth={2} />
      </button>

      {open && (
        <>
          {/* backdrop */}
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 49 }}
            onClick={() => setOpen(false)}
          />
          <div style={{
            position: 'absolute', right: 0, top: 'calc(100% + 4px)',
            background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 10, minWidth: 200, zIndex: 50,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden',
          }}>
            {canEdit && (
              <>
                <button
                  type="button"
                  onClick={() => { onEdit(row); setOpen(false) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    padding: '9px 12px', fontSize: 'var(--text-body)', cursor: 'pointer',
                    background: 'none',
                    borderTopWidth: "0px",
                    borderTopStyle: "none",
                    borderTopColor: "currentColor",
                    borderRightWidth: "0px",
                    borderRightStyle: "none",
                    borderRightColor: "currentColor",
                    borderLeftWidth: "0px",
                    borderLeftStyle: "none",
                    borderLeftColor: "currentColor", color: 'var(--ink-2)',
                    borderBottomWidth: (canSuperAdmin) ? "0px" : "1px",
                    borderBottomStyle: (canSuperAdmin) ? "none" : "solid",
                    borderBottomColor: (canSuperAdmin) ? "currentColor" : "var(--border)",
                  }}
                >
                  <Pencil size={14} strokeWidth={2} /> {locale === 'ar' ? 'تعديل المستخدم' : 'Edit user'}
                </button>
                {canSuperAdmin && (
                  <button
                    type="button"
                    onClick={() => { onChangePassword(row); setOpen(false) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                      padding: '9px 12px', fontSize: 'var(--text-body)', cursor: 'pointer',
                      background: 'none', border: 'none', color: 'var(--brand-active)',
                      fontWeight: 500,
                    }}
                  >
                    <KeyRound size={14} strokeWidth={2} /> {locale === 'ar' ? 'تغيير كلمة المرور' : 'Change password'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { onViewAudit(row); setOpen(false) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    padding: '9px 12px', fontSize: 'var(--text-body)', cursor: 'pointer',
                    background: 'none',
                    borderTopWidth: "0px",
                    borderTopStyle: "none",
                    borderTopColor: "currentColor",
                    borderRightWidth: "0px",
                    borderRightStyle: "none",
                    borderRightColor: "currentColor",
                    borderLeftWidth: "0px",
                    borderLeftStyle: "none",
                    borderLeftColor: "currentColor", color: 'var(--ink-2)',
                    borderBottomWidth: "1px",
                    borderBottomStyle: "solid",
                    borderBottomColor: "var(--border)",
                  }}
                >
                  <History size={14} strokeWidth={2} /> {locale === 'ar' ? 'سجل التدقيق' : 'Audit trail'}
                </button>
                <div style={{ padding: '8px 12px 4px', fontSize: 'var(--text-caption)', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                  {locale === 'ar' ? 'تغيير الدور' : 'Change Role'}
                </div>
                {assignableRoles.map(r => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => { onRoleChange(row.accountId, r.value); setOpen(false) }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '8px 12px', fontSize: 'var(--text-body)', cursor: 'pointer',
                      background: row.avaniisRole === r.value ? 'var(--surface)' : 'none',
                      color: row.avaniisRole === r.value ? 'var(--brand-active)' : 'var(--ink-2)',
                      border: 'none', fontWeight: row.avaniisRole === r.value ? 600 : 400,
                    }}
                  >
                    {r.label}
                    {row.avaniisRole === r.value && ' ✓'}
                  </button>
                ))}
                <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
                <button
                  type="button"
                  onClick={() => { onStatusToggle(row.accountId, !row.isActive); setOpen(false) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    padding: '9px 12px', fontSize: 'var(--text-body)', cursor: 'pointer',
                    background: 'none', border: 'none',
                    color: row.isActive ? 'var(--status-rejected-fg)' : 'var(--status-approved-fg)',
                  }}
                >
                  {row.isActive
                    ? <><ShieldOff size={14} strokeWidth={2} /> {locale === 'ar' ? 'تعطيل الحساب' : 'Deactivate account'}</>
                    : <><ShieldCheck size={14} strokeWidth={2} /> {locale === 'ar' ? 'تفعيل الحساب' : 'Activate account'}</>}
                </button>
              </>
            )}
            {isSelf && (
              <div style={{ padding: '10px 12px', fontSize: 'var(--text-caption)', color: 'var(--ink-4)' }}>
                {locale === 'ar' ? 'لا يمكنك تعديل حسابك الخاص.' : 'Cannot edit your own account.'}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── Main client component ─────────────────────────────────────────────────────

export function UsersClient({
  rows: initialRows,
  currentUserRole,
  currentUserId,
  departments,
  sortColumn:    initSortColumn,
  sortDirection: initSortDirection,
  defaultSearch    = '',
  defaultRole      = '',
  defaultUserType  = '',
}: {
  rows:             UserRow[]
  currentUserRole:  string
  currentUserId:    string
  departments:      DepartmentOption[]
  sortColumn:       string | null
  sortDirection:    'asc' | 'desc' | null
  defaultSearch?:   string
  defaultRole?:     string
  defaultUserType?: string
}) {
  const router       = useRouter()
  const locale       = useLocale()
  const pathname     = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [rows, setRows]               = useState<UserRow[]>(initialRows)
  const [editRow, setEditRow]         = useState<UserRow | null>(null)
  const [changePwdRow, setChangePwdRow] = useState<UserRow | null>(null)
  const [auditRow, setAuditRow]       = useState<UserRow | null>(null)
  const [sortCol, setSortCol] = useState<string | null>(initSortColumn)
  const [sortDir, setSortDir] = useState<SortDirection>(initSortDirection)
  const [search,          setSearch]          = useState(defaultSearch)
  const [roleFilter,      setRoleFilter]      = useState(defaultRole)
  const [userTypeFilter,  setUserTypeFilter]  = useState(defaultUserType)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync rows when server sends new filtered data after URL-based search
  useEffect(() => { setRows(initialRows) }, [initialRows])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())
      params.delete('page')
      if (search)          params.set('search',   search)
      else                 params.delete('search')
      if (roleFilter)      params.set('role',     roleFilter)
      else                 params.delete('role')
      if (userTypeFilter)  params.set('userType', userTypeFilter)
      else                 params.delete('userType')
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`, { scroll: false })
      })
    }, 350)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, roleFilter, userTypeFilter])

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

  function handleRoleChange(accountId: string, newRole: string) {
    setRows(prev =>
      prev.map(r => r.accountId === accountId ? { ...r, avaniisRole: newRole } : r),
    )
    startTransition(async () => {
      const res = await updateUserRole(accountId, newRole)
      if (!res.success) {
        setRows(initialRows)
        alert(res.error ?? (locale === 'ar' ? 'تعذّر تحديث الدور' : 'Failed to update role'))
      } else {
        router.refresh()
      }
    })
  }

  function handleStatusToggle(accountId: string, activate: boolean) {
    setRows(prev =>
      prev.map(r => r.accountId === accountId ? { ...r, isActive: activate } : r),
    )
    startTransition(async () => {
      const res = await toggleUserStatus(accountId, activate)
      if (!res.success) {
        setRows(initialRows)
        alert(res.error ?? (locale === 'ar' ? 'تعذّر تحديث الحالة' : 'Failed to update status'))
      } else {
        router.refresh()
      }
    })
  }

  function handleEditSave(accountId: string, email: string, role: string, isActive: boolean, departmentId: string | null) {
    // Find the department name for optimistic update
    const dept = departments.find(d => d.id === departmentId)
    setEditRow(null)
    setRows(prev =>
      prev.map(r => r.accountId === accountId
        ? { ...r, primaryEmail: email, avaniisRole: role, isActive, departmentId, departmentNameEn: dept?.nameEn ?? null }
        : r,
      ),
    )
    startTransition(async () => {
      const res = await updateUserAccount(accountId, { primaryEmail: email, avaniisRole: role, isActive, departmentId })
      if (!res.success) {
        setRows(initialRows)
        alert(res.error ?? (locale === 'ar' ? 'تعذّر تحديث المستخدم' : 'Failed to update user'))
      } else {
        router.refresh()
      }
    })
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
    {editRow && (
      <EditModal
        row={editRow}
        currentUserRole={currentUserRole}
        departments={departments}
        onSave={handleEditSave}
        onClose={() => setEditRow(null)}
      />
    )}
    {changePwdRow && (
      <ChangePasswordModal
        row={changePwdRow}
        onClose={() => setChangePwdRow(null)}
      />
    )}

    {/* Search + role filter — never scrolls */}
    <div style={{ flexShrink: 0, display: 'flex', gap: 10,
    marginBottom: 12, flexWrap: 'wrap' }}>
      <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
        <Search size={14} style={{
          position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
          color: 'var(--ink-4)', pointerEvents: 'none',
        }} />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={locale === 'ar' ? 'ابحث بالاسم أو البريد أو الدور أو القسم أو الحالة…' : 'Search by name, email, role, department, status…'}
          style={{
            width: '100%', padding: '8px 32px 8px 32px', height: 36,
            border: '1px solid var(--border)', borderRadius: 8,
            fontSize: 'var(--text-body)', color: 'var(--ink-1)', background: 'var(--card)',
            outline: 'none', boxSizing: 'border-box',
          }}
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            style={{
              position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--ink-4)', padding: 2, display: 'flex', alignItems: 'center',
            }}
          >
            <X size={13} />
          </button>
        )}
      </div>
      <select
        value={roleFilter}
        onChange={e => setRoleFilter(e.target.value)}
        style={{
          height: 36, border: '1px solid var(--border)', borderRadius: 7,
          padding: '0 10px', fontSize: 'var(--text-body)', background: 'var(--card)',
          color: 'var(--ink-1)', cursor: 'pointer', outline: 'none',
        }}
      >
        <option value="">{locale === 'ar' ? 'كل الأدوار' : 'All roles'}</option>
        {ALL_ROLES.map(r => (
          <option key={r.value} value={r.value}>{r.label}</option>
        ))}
      </select>
      <select
        value={userTypeFilter}
        onChange={e => setUserTypeFilter(e.target.value)}
        style={{
          height: 36, border: '1px solid var(--border)', borderRadius: 7,
          padding: '0 10px', fontSize: 'var(--text-body)', background: 'var(--card)',
          color: 'var(--ink-1)', cursor: 'pointer', outline: 'none',
        }}
      >
        <option value="">{locale === 'ar' ? 'كل الأنواع' : 'All types'}</option>
        <option value="employee">{locale === 'ar' ? 'موظف' : 'Employee'}</option>
        <option value="non-employee">{locale === 'ar' ? 'غير موظف' : 'Non-Employee'}</option>
        <option value="system">{locale === 'ar' ? 'مستخدم نظام' : 'System User'}</option>
      </select>
    </div>

    {/* Table card — fills remaining height, scrolls vertically */}
    <div style={{
      flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
      background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
    }}>
      <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
        <TableScrollRegion><table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
            <tr>
              <SortableHeader label={locale === 'ar' ? 'الرقم الوظيفي' : 'Emp. No'}    column="person_number" activeColumn={sortCol} direction={sortDir} onSort={handleSort} />
              <SortableHeader label={locale === 'ar' ? 'الاسم' : 'Name'}       column="name"          activeColumn={sortCol} direction={sortDir} onSort={handleSort} />
              <SortableHeader label={locale === 'ar' ? 'البريد الإلكتروني' : 'Email'}      column="email"         activeColumn={sortCol} direction={sortDir} onSort={handleSort} />
              <SortableHeader label={locale === 'ar' ? 'الدور' : 'Role'}       column="role"          activeColumn={sortCol} direction={sortDir} onSort={handleSort} />
              <SortableHeader label={locale === 'ar' ? 'نوع المستخدم' : 'User Type'}  column="user_type"     activeColumn={sortCol} direction={sortDir} onSort={handleSort} />
              <SortableHeader label={locale === 'ar' ? 'القسم' : 'Department'} column="department"    activeColumn={sortCol} direction={sortDir} onSort={handleSort} />
              <SortableHeader label={locale === 'ar' ? 'الحالة' : 'Status'}     column="status"        activeColumn={sortCol} direction={sortDir} onSort={handleSort} />
              <SortableHeader label={locale === 'ar' ? 'آخر تسجيل دخول' : 'Last Login'} column="last_login"    activeColumn={sortCol} direction={sortDir} onSort={handleSort} />
              <th style={{
                padding: '12px 20px', background: 'var(--surface)',
                borderBottom: '1px solid var(--border)', width: 48,
              }} />
            </tr>
          </thead>
          <tbody style={{ opacity: isPending ? 0.5 : 1, pointerEvents: isPending ? 'none' : 'auto', transition: 'opacity 0.15s ease' }}>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ padding: '48px 20px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 48, height: 48, borderRadius: '50%',
                      background: 'var(--accent-100)', display: 'grid',
                      placeItems: 'center', color: 'var(--brand-active)',
                    }}>
                      <Inbox size={20} strokeWidth={1.75} />
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 600, fontFamily: 'var(--font-serif)', color: 'var(--ink-1)' }}>
                      {locale === 'ar' ? 'لا يوجد مستخدمون' : 'No users found'}
                    </div>
                  </div>
                </td>
              </tr>
            ) : rows.map((r, i) => (
              <tr
                key={r.accountId}
                style={{
                  borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none',
                  transition: 'background 120ms',
                }}
                className="hover:bg-surface"
              >
                <td style={{ padding: '14px 20px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>
                    {r.personNumber ?? '—'}
                  </span>
                </td>
                <td style={{ padding: '14px 20px', verticalAlign: 'middle' }}>
                  <div style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)' }}>
                    {r.fullNameEn ?? '—'}
                  </div>
                </td>
                <td style={{ padding: '14px 20px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)', color: 'var(--ink-2)', verticalAlign: 'middle' }}>
                  {r.primaryEmail}
                </td>
                <td style={{ padding: '14px 20px', verticalAlign: 'middle' }}>
                  <RolePill role={r.avaniisRole} />
                </td>
                <td style={{ padding: '14px 20px', verticalAlign: 'middle' }}>
                  {r.isSystemUser ? (
                    <span style={{
                      display: 'inline-block', fontSize: 'var(--text-caption)', fontWeight: 700,
                      letterSpacing: '0.04em', textTransform: 'uppercase',
                      padding: '2px 8px', borderRadius: 6,
                      background: 'var(--status-draft-bg)', color: 'var(--status-draft-fg)',
                    }}>
                      {locale === 'ar' ? 'نظام' : 'System'}
                    </span>
                  ) : ['TASK_BASED', 'TEMPORARY', 'PART_TIME'].includes(r.employmentType ?? '') ? (
                    <span style={{
                      display: 'inline-block', fontSize: 'var(--text-caption)', fontWeight: 700,
                      letterSpacing: '0.04em', textTransform: 'uppercase',
                      padding: '2px 8px', borderRadius: 6,
                      background: 'var(--status-pending-bg)', color: 'var(--status-pending-fg)',
                    }}>
                      {locale === 'ar' ? 'غير موظف' : 'Non-Employee'}
                    </span>
                  ) : (
                    <span style={{
                      display: 'inline-block', fontSize: 'var(--text-caption)', fontWeight: 700,
                      letterSpacing: '0.04em', textTransform: 'uppercase',
                      padding: '2px 8px', borderRadius: 6,
                      background: 'var(--surface)', color: 'var(--ink-3)',
                    }}>
                      {locale === 'ar' ? 'موظف' : 'Employee'}
                    </span>
                  )}
                </td>
                <td style={{ padding: '14px 20px', fontSize: 'var(--text-body)', color: 'var(--ink-2)', verticalAlign: 'middle' }}>
                  {r.departmentNameEn ?? '—'}
                </td>
                <td style={{ padding: '14px 20px', verticalAlign: 'middle' }}>
                  <StatusDot active={r.isActive} />
                </td>
                <td style={{ padding: '14px 20px', fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                  {formatDMY(r.lastLoginAt)}
                </td>
                <td style={{ padding: '14px 20px', verticalAlign: 'middle', textAlign: 'right' }}>
                  <RowMenu
                    row={r}
                    currentUserRole={currentUserRole}
                    currentUserId={currentUserId}
                    onRoleChange={handleRoleChange}
                    onStatusToggle={handleStatusToggle}
                    onEdit={setEditRow}
                    onChangePassword={setChangePwdRow}
                    onViewAudit={setAuditRow}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table></TableScrollRegion>
      </div>
    </div>

    {/* Audit trail drawer */}
    {auditRow && (
      <RecordHistoryDrawer
        isOpen={!!auditRow}
        onClose={() => setAuditRow(null)}
        recordId={auditRow.accountId}
        recordNameEn={auditRow.fullNameEn ?? auditRow.primaryEmail}
        resourceType="user_accounts"
      />
    )}
    </div>
  )
}
