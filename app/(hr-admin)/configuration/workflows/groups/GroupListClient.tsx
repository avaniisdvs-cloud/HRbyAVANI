'use client'

import { useState, useTransition, useMemo, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Users, MoreHorizontal, Edit2, UserPlus, Power, PowerOff } from 'lucide-react'
import { StatusBadge } from '@/components/mdm/StatusBadge'
import { toggleGroupActive } from '@/modules/workflow/actions'
import { GroupDrawer } from './GroupDrawer'
import type { PersonOption } from '@/components/forms/PersonSelect'
import type { ApprovalGroupRow } from '@/modules/workflow/actions'
import { type Locale } from '@/lib/i18n'

// ── Actions menu ───────────────────────────────────────────────────────────

function ActionsMenu({
  row,
  onEdit,
  onMembers,
  onToggle,
  locale = 'en',
}: {
  row:       ApprovalGroupRow
  onEdit:    (row: ApprovalGroupRow) => void
  onMembers: (row: ApprovalGroupRow) => void
  onToggle:  (row: ApprovalGroupRow) => void
  locale?:   Locale
}) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null)

  // Position the portal menu just below the button using viewport coordinates,
  // so it is never clipped by the table container's `overflow: hidden`.
  useEffect(() => {
    if (!open || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    setCoords({ top: r.bottom + 4, right: window.innerWidth - r.right })
  }, [open])

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={btnRef}
        onClick={() => setOpen(o => !o)}
        style={{
          width: 30, height: 30,
          border: '1px solid var(--border)',
          borderRadius: 6,
          background: 'transparent',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--ink-3)',
        }}
        aria-label={locale === 'ar' ? 'إجراءات الصف' : 'Row actions'}
      >
        <MoreHorizontal size={15} />
      </button>

      {open && coords && typeof document !== 'undefined' && createPortal(
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 1000 }} />
          <div style={{
            position: 'fixed', top: coords.top, right: coords.right, zIndex: 1001,
            width: 168,
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            overflow: 'hidden',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          }}>
            <MenuItem icon={<Edit2 size={13} />} label={locale === 'ar' ? 'تعديل التفاصيل' : 'Edit details'} onClick={() => { setOpen(false); onEdit(row) }} />
            <MenuItem icon={<UserPlus size={13} />} label={locale === 'ar' ? 'إدارة الأعضاء' : 'Manage members'} onClick={() => { setOpen(false); onMembers(row) }} />
            {row.isActive
              ? <MenuItem icon={<PowerOff size={13} />} label={locale === 'ar' ? 'تعطيل' : 'Disable'} onClick={() => { setOpen(false); onToggle(row) }} danger />
              : <MenuItem icon={<Power size={13} />} label={locale === 'ar' ? 'تفعيل' : 'Enable'} onClick={() => { setOpen(false); onToggle(row) }} />
            }
          </div>
        </>,
        document.body,
      )}
    </div>
  )
}

function MenuItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        width: '100%', padding: '9px 14px',
        border: 'none', background: 'none', cursor: 'pointer',
        fontSize: 'var(--text-body)', color: danger ? '#C62828' : 'var(--ink-1)', textAlign: 'left',
      }}
    >
      {icon} {label}
    </button>
  )
}

// ── GroupListClient ────────────────────────────────────────────────────────

interface GroupListClientProps {
  initialData:   ApprovalGroupRow[]
  personOptions: PersonOption[]
  locale?:       Locale
}

type DrawerMode = 'details' | 'members'

export function GroupListClient({ initialData, personOptions, locale = 'en' }: GroupListClientProps) {
  const router = useRouter()
  const [data,          setData]          = useState<ApprovalGroupRow[]>(initialData)
  const [search,        setSearch]        = useState('')
  const [drawerOpen,    setDrawerOpen]    = useState(false)
  const [drawerMode,    setDrawerMode]    = useState<DrawerMode>('details')
  const [editRow,       setEditRow]       = useState<ApprovalGroupRow | null>(null)
  const [toast,         setToast]         = useState<string | null>(null)
  const [,              startTransition]  = useTransition()

  // Keep the table in sync if the server data changes (e.g. after router.refresh()).
  useEffect(() => { setData(initialData) }, [initialData])

  // ── Filtered rows ──────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    if (!q) return data
    return data.filter(r =>
      r.groupCode.toLowerCase().includes(q) ||
      r.groupNameEn.toLowerCase().includes(q) ||
      (r.groupNameAr ?? '').toLowerCase().includes(q),
    )
  }, [data, search])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  function handleNew() {
    setEditRow(null)
    setDrawerMode('details')
    setDrawerOpen(true)
  }

  function handleEdit(row: ApprovalGroupRow) {
    setEditRow(row)
    setDrawerMode('details')
    setDrawerOpen(true)
  }

  function handleMembers(row: ApprovalGroupRow) {
    setEditRow(row)
    setDrawerMode('members')
    setDrawerOpen(true)
  }

  function handleToggle(row: ApprovalGroupRow) {
    startTransition(async () => {
      const result = await toggleGroupActive(row.id, !row.isActive)
      if (result.success) {
        setData(prev => prev.map(r => r.id === row.id ? { ...r, isActive: !row.isActive } : r))
        showToast(locale === 'ar'
          ? `المجموعة ${row.groupCode} ${row.isActive ? 'مُعطّلة' : 'مُفعّلة'}.`
          : `Group ${row.groupCode} ${row.isActive ? 'disabled' : 'enabled'}.`)
      } else {
        showToast(result.error ?? (locale === 'ar' ? 'تعذّر تغيير حالة المجموعة.' : 'Failed to toggle group.'))
      }
    })
  }

  function handleDrawerSuccess(updated?: ApprovalGroupRow) {
    const wasCreate = !editRow
    if (updated) {
      setData(prev => {
        const exists = prev.find(r => r.id === updated.id)
        return exists
          ? prev.map(r => r.id === updated.id ? updated : r)
          : [updated, ...prev]
      })
    }
    showToast(wasCreate
      ? (locale === 'ar' ? 'تم إنشاء المجموعة — أضف الأعضاء الآن.' : 'Group created — now add members.')
      : (locale === 'ar' ? 'تم حفظ المجموعة.' : 'Group saved.'))
    // The drawer self-continues to the Members tab on create; the list refreshes
    // on close (see onClose) to pull authoritative member counts.
  }

  function handleDrawerClose() {
    setDrawerOpen(false)
    router.refresh()
  }

  const activeCount   = data.filter(r => r.isActive).length
  const inactiveCount = data.filter(r => !r.isActive).length

  return (
    <>
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: 'var(--accent-100)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--brand-active)',
          }}>
            <Users size={20} />
          </div>
          <div>
            <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 22, fontWeight: 500, color: 'var(--ink-1)', margin: 0 }}>
              {locale === 'ar' ? 'مجموعات الاعتماد' : 'Approval Groups'}
            </h1>
            <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', margin: '2px 0 0' }}>
              {locale === 'ar' ? 'مجموعات معتمِدين مُسمّاة لتعيينات مراحل سير العمل.' : 'Named approver groups for workflow stage assignments.'}{' '}
              <span style={{ color: 'var(--brand-active)', fontWeight: 600 }}>{activeCount}</span> {locale === 'ar' ? 'نشطة' : 'active'}
              {inactiveCount > 0 && <>, {inactiveCount} {locale === 'ar' ? 'غير نشطة' : 'inactive'}</>}
            </p>
          </div>
        </div>
        <button
          onClick={handleNew}
          style={{
            height: 36, padding: '0 16px',
            border: 'none', borderRadius: 8,
            background: 'var(--accent)', color: '#fff',
            fontSize: 'var(--text-body)', fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          {locale === 'ar' ? '+ مجموعة جديدة' : '+ New Group'}
        </button>
      </div>

      {/* ── Search bar ───────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 16 }}>
        <input
          type="search"
          placeholder={locale === 'ar' ? 'ابحث بالرمز أو الاسم…' : 'Search by code or name…'}
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%', maxWidth: 340,
            border: '1.5px solid var(--border)', borderRadius: 8,
            padding: '8px 12px', fontSize: 'var(--text-body)',
            background: 'var(--card)', color: 'var(--ink-1)',
            outline: 'none', boxSizing: 'border-box',
          }}
        />
      </div>

      {/* ── Table ────────────────────────────────────────────────────────── */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: 'var(--card)' }}>
        {/* Table header */}
        <div data-responsive-grid="true" style={{
          display: 'grid',
          gridTemplateColumns: '120px 1fr 110px 120px 80px 90px 44px',
          padding: '0 16px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface)',
        }}>
          {(locale === 'ar'
            ? ['الرمز', 'الاسم', 'النوع', 'التصويت', 'الأعضاء', 'الحالة', '']
            : ['Code', 'Name', 'Type', 'Voting', 'Members', 'Status', '']
          ).map((col, i) => (
            <div key={i} style={{ padding: '10px 8px', fontSize: 'var(--text-caption)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-3)' }}>
              {col}
            </div>
          ))}
        </div>

        {/* Rows */}
        {filtered.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--ink-4)', fontSize: 14 }}>
            {data.length === 0
              ? (locale === 'ar' ? 'لا توجد مجموعات اعتماد بعد. انقر على + مجموعة جديدة لإنشاء أول مجموعة.' : 'No approval groups yet. Click + New Group to create the first one.')
              : (locale === 'ar' ? 'لا توجد مجموعات تطابق بحثك.' : 'No groups match your search.')}
          </div>
        ) : (
          filtered.map(row => (
            <div
              data-responsive-grid="true" key={row.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '120px 1fr 110px 120px 80px 90px 44px',
                padding: '0 16px',
                borderBottom: '1px solid var(--border)',
                alignItems: 'center',
                opacity: row.isActive ? 1 : 0.6,
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
                  {row.groupCode}
                </span>
              </div>

              {/* Name */}
              <div style={{ padding: '14px 8px' }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink-1)' }}>{row.groupNameEn}</div>
                {row.groupNameAr && (
                  <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', direction: 'rtl', marginTop: 2 }}>{row.groupNameAr}</div>
                )}
              </div>

              {/* Member type */}
              <div style={{ padding: '14px 8px' }}>
                <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-2)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px' }}>
                  {row.memberType}
                </span>
              </div>

              {/* Voting method */}
              <div style={{ padding: '14px 8px', fontSize: 'var(--text-caption)', color: 'var(--ink-2)' }}>
                {row.votingMethod.replace('_', ' ')}
              </div>

              {/* Members count */}
              <div style={{ padding: '14px 8px', fontSize: 'var(--text-body)', fontFamily: 'var(--font-mono)', color: 'var(--ink-2)' }}>
                {row.memberCount}
              </div>

              {/* Status */}
              <div style={{ padding: '14px 8px' }}>
                <StatusBadge active={row.isActive} />
              </div>

              {/* Actions */}
              <div style={{ padding: '14px 8px', display: 'flex', justifyContent: 'flex-end' }}>
                <ActionsMenu
                  row={row}
                  onEdit={handleEdit}
                  onMembers={handleMembers}
                  onToggle={handleToggle}
                  locale={locale}
                />
              </div>
            </div>
          ))
        )}
      </div>

      {filtered.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 'var(--text-caption)', color: 'var(--ink-4)' }}>
          {locale === 'ar'
            ? `عرض ${filtered.length} من ${data.length} مجموعة`
            : `Showing ${filtered.length} of ${data.length} groups`}
        </div>
      )}

      {/* ── Drawer ───────────────────────────────────────────────────────── */}
      <GroupDrawer
        open={drawerOpen}
        initialTab={drawerMode}
        onClose={handleDrawerClose}
        onSuccess={handleDrawerSuccess}
        editRow={editRow}
        personOptions={personOptions}
        locale={locale}
      />

      {/* ── Toast ────────────────────────────────────────────────────────── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 100,
          background: 'var(--ink-1)', color: '#fff',
          padding: '10px 18px', borderRadius: 8,
          fontSize: 'var(--text-body)', fontWeight: 500,
        }}>
          {toast}
        </div>
      )}
    </>
  )
}
