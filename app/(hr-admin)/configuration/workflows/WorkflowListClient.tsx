'use client'

import { PageTitle } from '@/components/ui/typography'
import Link from 'next/link'
import { useState, useTransition, useMemo, useRef, useEffect } from 'react'
import { GitBranch, Plus, MoreHorizontal, Edit2, ChevronRight, Power, PowerOff } from 'lucide-react'
import { toggleWorkflowActive } from '@/modules/workflow/actions'
import type { WorkflowDefinitionRow } from '@/modules/workflow/actions'
import { StatusBadge } from '@/components/mdm/StatusBadge'
import { WorkflowDrawer } from './WorkflowDrawer'
import { useLocale } from '@/components/providers/LocaleProvider'
import type { Locale } from '@/lib/i18n'

// ── Types ──────────────────────────────────────────────────────────────────

type StatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE'

interface WorkflowListClientProps {
  initialData: WorkflowDefinitionRow[]
}

// ── Grid layout ───────────────────────────────────────────────────────────

const GRID_COLS = '140px 1fr 140px 130px 90px 70px 110px 44px'

// ── Trigger event badge ────────────────────────────────────────────────────

const TRIGGER_LABELS: Record<string, string> = {
  LEAVE_REQUEST:    'Leave Request',
  HIRE:             'Hire',
  TRANSFER:         'Transfer',
  SALARY_REVISION:  'Salary Revision',
  TERMINATION:      'Termination',
  OVERTIME_REQUEST: 'Overtime',
  EXIT_CLEARANCE:   'Exit Clearance',
  PROBATION_CONFIRM:'Probation Confirm',
  VISA_RENEWAL:     'Visa Renewal',
  BACKDATED_HIRE:   'Backdated Hire',
}

const TRIGGER_LABELS_AR: Record<string, string> = {
  LEAVE_REQUEST:    'طلب إجازة',
  HIRE:             'تعيين',
  TRANSFER:         'نقل',
  SALARY_REVISION:  'مراجعة الراتب',
  TERMINATION:      'إنهاء الخدمة',
  OVERTIME_REQUEST: 'عمل إضافي',
  EXIT_CLEARANCE:   'إخلاء الطرف',
  PROBATION_CONFIRM:'تأكيد فترة التجربة',
  VISA_RENEWAL:     'تجديد التأشيرة',
  BACKDATED_HIRE:   'تعيين بأثر رجعي',
}

function TriggerBadge({ event, locale = 'en' }: { event: string; locale?: Locale }) {
  const label = locale === 'ar'
    ? (TRIGGER_LABELS_AR[event] ?? TRIGGER_LABELS[event] ?? event)
    : (TRIGGER_LABELS[event] ?? event)
  return (
    <span style={{
      fontSize: 'var(--text-caption)',
      fontWeight: 600,
      padding: '3px 8px',
      borderRadius: 6,
      background: 'var(--status-pending-bg, #FFF8E1)',
      color: 'var(--status-pending-text, #F57F17)',
      border: '1px solid var(--status-pending-border, #FFE082)',
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
    }}>
      {label}
    </span>
  )
}

// ── Actions menu ───────────────────────────────────────────────────────────

function ActionsMenu({
  row,
  onEdit,
  onToggle,
  locale = 'en',
}: {
  row:      WorkflowDefinitionRow
  onEdit:   (row: WorkflowDefinitionRow) => void
  onToggle: (row: WorkflowDefinitionRow) => void
  locale?:  Locale
}) {
  const [open, setOpen]         = useState(false)
  const [menuPos, setMenuPos]   = useState({ top: 0, right: 0 })
  const btnRef                  = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    function onScroll() { setOpen(false) }
    window.addEventListener('scroll', onScroll, true)
    return () => window.removeEventListener('scroll', onScroll, true)
  }, [open])

  function handleOpen() {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setMenuPos({ top: r.bottom + 4, right: window.innerWidth - r.right })
    }
    setOpen(o => !o)
  }

  return (
    <div>
      <button
        ref={btnRef}
        onClick={handleOpen}
        aria-label={locale === 'ar' ? 'إجراءات' : 'Actions'}
        style={{
          width: 30, height: 30,
          border: '1px solid var(--border)',
          borderRadius: 6,
          background: 'transparent',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--ink-3)',
        }}
      >
        <MoreHorizontal size={15} />
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 50 }} />
          <div style={{
            position: 'fixed',
            top:   menuPos.top,
            right: menuPos.right,
            zIndex: 51,
            width: 170,
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
            overflow: 'hidden',
          }}>
            <button
              onClick={() => { setOpen(false); onEdit(row) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%', padding: '9px 14px',
                border: 'none', background: 'none', cursor: 'pointer',
                fontSize: 'var(--text-body)', color: 'var(--ink-1)', textAlign: 'left',
              }}
            >
              <Edit2 size={13} /> {locale === 'ar' ? 'تعديل' : 'Edit'}
            </button>
            <Link
              href={`/configuration/workflows/${row.id}`}
              onClick={() => setOpen(false)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%', padding: '9px 14px',
                textDecoration: 'none',
                fontSize: 'var(--text-body)', color: 'var(--ink-2)',
              }}
            >
              <ChevronRight size={13} /> {locale === 'ar' ? 'عرض الخطوات' : 'View Steps'}
            </Link>
            <button
              onClick={() => { setOpen(false); onToggle(row) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%', padding: '9px 14px',
                border: 'none', background: 'none', cursor: 'pointer',
                fontSize: 'var(--text-body)',
                color: row.isActive ? 'var(--status-rejected-fg)' : 'var(--brand-active)',
                textAlign: 'left',
              }}
            >
              {row.isActive
                ? <><PowerOff size={13} /> {locale === 'ar' ? 'تعطيل' : 'Disable'}</>
                : <><Power size={13} /> {locale === 'ar' ? 'تفعيل' : 'Enable'}</>}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ── WorkflowListClient ─────────────────────────────────────────────────────

export function WorkflowListClient({ initialData }: WorkflowListClientProps) {
  const locale = useLocale()
  const [data,       setData]       = useState<WorkflowDefinitionRow[]>(initialData)
  const [search,     setSearch]     = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editRow,    setEditRow]    = useState<WorkflowDefinitionRow | null>(null)
  const [toastMsg,   setToastMsg]   = useState<string | null>(null)
  const [isPending,  startTransition] = useTransition()

  // ── Counts ─────────────────────────────────────────────────────────────
  const totalCount    = data.length
  const activeCount   = data.filter(r => r.isActive).length
  const inactiveCount = data.filter(r => !r.isActive).length

  // ── Filtered rows ──────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return data.filter(row => {
      if (statusFilter === 'ACTIVE'   && !row.isActive) return false
      if (statusFilter === 'INACTIVE' &&  row.isActive) return false
      if (q && ![
        row.workflowCode,
        row.workflowNameEn,
        row.workflowNameAr ?? '',
        row.triggerEvent,
      ].some(v => v.toLowerCase().includes(q))) return false
      return true
    })
  }, [data, search, statusFilter])

  function showToast(msg: string) {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(null), 3000)
  }

  function handleNew() {
    setEditRow(null)
    setDrawerOpen(true)
  }

  function handleEdit(row: WorkflowDefinitionRow) {
    setEditRow(row)
    setDrawerOpen(true)
  }

  function handleToggle(row: WorkflowDefinitionRow) {
    const nextActive = !row.isActive
    startTransition(async () => {
      const result = await toggleWorkflowActive(row.id, nextActive)
      if (result.success) {
        setData(prev => prev.map(r => r.id === row.id ? { ...r, isActive: nextActive } : r))
        showToast(locale === 'ar'
          ? `سير العمل ${row.workflowCode} ${nextActive ? 'مُفعّل' : 'مُعطّل'}.`
          : `Workflow ${row.workflowCode} ${nextActive ? 'enabled' : 'disabled'}.`)
      } else {
        showToast(result.error ?? (locale === 'ar' ? 'تعذّر تحديث حالة سير العمل.' : 'Failed to update workflow status.'))
      }
    })
  }

  function handleDrawerSuccess(updated: WorkflowDefinitionRow) {
    const exists = data.find(r => r.id === updated.id)
    if (exists) {
      setData(prev => prev.map(r => r.id === updated.id ? updated : r))
      showToast(locale === 'ar' ? 'تم تحديث سير العمل.' : 'Workflow updated.')
    } else {
      setData(prev => [updated, ...prev])
      showToast(locale === 'ar' ? 'تم إنشاء سير العمل.' : 'Workflow created.')
    }
    setDrawerOpen(false)
  }

  return (
    <div className="page-in">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 42, height: 42,
            borderRadius: 10,
            background: 'var(--accent-100)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--brand-active)',
          }}>
            <GitBranch size={20} />
          </div>
          <div>
            <PageTitle style={{ margin: 0, fontSize: 20, fontWeight: 500, fontFamily: 'var(--font-serif)', letterSpacing: '-0.3px', color: 'var(--ink-1)' }}>
              {locale === 'ar' ? 'تعريفات سير العمل' : 'Workflow Definitions'}
            </PageTitle>
            <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)',
            marginTop: 2 }}>
              {locale === 'ar'
                ? `${totalCount} الإجمالي · ${activeCount} نشط · ${inactiveCount} غير نشط`
                : `${totalCount} total · ${activeCount} active · ${inactiveCount} inactive`}
            </div>
          </div>
        </div>
        <button
          onClick={handleNew}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            height: 36, padding: '0 16px',
            border: 'none', borderRadius: 10,
            background: 'var(--accent)', color: "var(--on-accent)",
            fontSize: 'var(--text-body)', fontWeight: 600, cursor: 'pointer',
          }}
        >
          <Plus size={14} /> {locale === 'ar' ? 'سير عمل جديد' : 'New Workflow'}
        </button>
      </div>

      {/* ── Filter bar ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10,
      marginBottom: 18, alignItems: 'center' }}>
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={locale === 'ar' ? 'ابحث بالرمز أو الاسم أو المُحفِّز…' : 'Search by code, name, trigger…'}
          style={{
            flex: 1,
            maxWidth: 360,
            height: 36,
            border: '1.5px solid var(--border)',
            borderRadius: 8,
            padding: '0 12px',
            fontSize: 'var(--text-body)',
            color: 'var(--ink-1)',
            background: 'var(--card)',
            outline: 'none',
          }}
        />
        {(['ALL', 'ACTIVE', 'INACTIVE'] as StatusFilter[]).map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            style={{
              height: 34, padding: '0 14px',
              borderTopWidth: "1.5px",
              borderTopStyle: "solid",
              borderRightWidth: "1.5px",
              borderRightStyle: "solid",
              borderBottomWidth: "1.5px",
              borderBottomStyle: "solid",
              borderLeftWidth: "1.5px",
              borderLeftStyle: "solid",
              borderTopColor: statusFilter === s ? 'var(--accent)' : 'var(--border)',
              borderRightColor: statusFilter === s ? 'var(--accent)' : 'var(--border)',
              borderBottomColor: statusFilter === s ? 'var(--accent)' : 'var(--border)',
              borderLeftColor: statusFilter === s ? 'var(--accent)' : 'var(--border)',
              borderRadius: 8,
              background: statusFilter === s ? 'var(--accent-100)' : 'transparent',
              color: statusFilter === s ? 'var(--brand-active)' : 'var(--ink-2)',
              fontSize: 'var(--text-caption)', fontWeight: 600,
              cursor: 'pointer',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            {locale === 'ar'
              ? (s === 'ALL' ? 'الكل' : s === 'ACTIVE' ? 'نشط' : 'غير نشط')
              : s}
          </button>
        ))}
      </div>

      {/* ── Table ──────────────────────────────────────────────────────── */}
      <div style={{
        border: '1px solid var(--border)',
        borderRadius: 10,
        overflow: 'hidden',
        background: 'var(--card)',
      }}>
        {/* Header row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: GRID_COLS,
          padding: '0 16px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface)',
        }}>
          {(locale === 'ar'
            ? ['الرمز', 'الاسم', 'الحدث المُحفِّز', 'نوع التسلسل', 'ساعات SLA', 'الخطوات', 'الحالة', '']
            : ['Code', 'Name', 'Trigger Event', 'Hierarchy Type', 'SLA Hrs', 'Steps', 'Status', '']
          ).map((col, i) => (
            <div key={i} style={{
              padding: '10px 8px',
              fontSize: 'var(--text-caption)', fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--ink-3)',
            }}>
              {col}
            </div>
          ))}
        </div>

        {/* Rows */}
        {filtered.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--ink-4)', fontSize: 'var(--text-body)' }}>
            {data.length === 0
              ? (locale === 'ar' ? 'لا توجد تعريفات سير عمل بعد. أنشئ أول واحدة.' : 'No workflow definitions yet. Create the first one.')
              : (locale === 'ar' ? 'لا توجد عمليات سير عمل تطابق عوامل التصفية الحالية.' : 'No workflows match the current filters.')}
          </div>
        ) : (
          filtered.map(row => (
            <div
              key={row.id}
              style={{
                display: 'grid',
                gridTemplateColumns: GRID_COLS,
                padding: '0 16px',
                borderBottom: '1px solid var(--border)',
                alignItems: 'center',
                opacity: row.isActive ? 1 : 0.65,
              }}
            >
              {/* Code */}
              <div style={{ padding: '14px 8px' }}>
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--text-caption)', fontWeight: 700,
                  color: 'var(--brand-active)',
                  background: 'var(--accent-100)',
                  padding: '2px 8px', borderRadius: 4,
                }}>
                  {row.workflowCode}
                </span>
              </div>

              {/* Name */}
              <div style={{ padding: '14px 8px' }}>
                <div style={{ fontSize: 'var(--text-body)', fontWeight: 500, color: 'var(--ink-1)' }}>
                  {row.workflowNameEn}
                </div>
                {row.workflowNameAr && (
                  <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', direction: 'rtl',
                  marginTop: 2 }}>
                    {row.workflowNameAr}
                  </div>
                )}
              </div>

              {/* Trigger Event */}
              <div style={{ padding: '14px 8px' }}>
                <TriggerBadge event={row.triggerEvent} locale={locale} />
              </div>

              {/* Hierarchy Type */}
              <div style={{ padding: '14px 8px', fontSize: 'var(--text-caption)', color: 'var(--ink-2)' }}>
                {row.defaultHierarchyType
                  ? row.defaultHierarchyType.replace(/_/g, ' ')
                  : <span style={{ color: 'var(--ink-4)', fontStyle: 'italic' }}>—</span>
                }
              </div>

              {/* SLA Hours */}
              <div style={{ padding: '14px 8px' }}>
                <span style={{
                  fontSize: 'var(--text-caption)',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '3px 8px',
                  color: 'var(--ink-2)',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 600,
                }}>
                  {row.defaultSlaHours}h
                </span>
              </div>

              {/* Steps */}
              <div style={{ padding: '14px 8px', fontSize: 'var(--text-body)', color: 'var(--ink-2)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                {row.stepCount}
              </div>

              {/* Status */}
              <div style={{ padding: '14px 8px' }}>
                <StatusBadge active={row.isActive} />
              </div>

              {/* Actions */}
              <div style={{ padding: '14px 8px', display: 'flex', justifyContent: 'flex-end' }}>
                <ActionsMenu row={row} onEdit={handleEdit} onToggle={handleToggle} locale={locale} />
              </div>
            </div>
          ))
        )}
      </div>

      {/* Row count */}
      {filtered.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 'var(--text-caption)', color: 'var(--ink-4)' }}>
          {locale === 'ar'
            ? `عرض ${filtered.length} من ${totalCount} تعريف سير عمل`
            : `Showing ${filtered.length} of ${totalCount} workflow definitions`}
        </div>
      )}

      {/* Drawer */}
      <WorkflowDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSuccess={handleDrawerSuccess}
        editRow={editRow}
      />

      {/* Toast */}
      {toastMsg && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 100,
          background: 'var(--ink-1)', color: "var(--on-accent)",
          padding: '10px 18px', borderRadius: 8,
          fontSize: 'var(--text-body)', fontWeight: 500,
        }}>
          {toastMsg}
        </div>
      )}
    </div>
  )
}
