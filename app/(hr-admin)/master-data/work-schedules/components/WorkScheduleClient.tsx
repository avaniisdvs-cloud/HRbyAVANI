'use client'

import { TableScrollRegion } from '@/components/ui/TableScrollRegion'
import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarRange, Pencil, Ban, CheckCircle2, Clock } from 'lucide-react'
import { useLocale } from '@/components/providers/LocaleProvider'
import { tk } from '@/lib/i18n-messages'
import { useTableSort } from '@/hooks/useTableSort'
import { SortableHeader } from '@/components/ui/SortableHeader'
import { RecordHistoryDrawer } from '@/components/mdm/RecordHistoryDrawer'
import { MdmPageHeader } from '@/components/mdm/MdmPageHeader'
import { MdmFilterBar } from '@/components/mdm/MdmFilterBar'
import { MdmChangeHistory } from '@/components/mdm/MdmChangeHistory'
import { StatusBadge } from '@/components/mdm/StatusBadge'
import { DisableConfirmDialog } from '@/components/mdm/DisableConfirmDialog'
import type { AuditHistoryEntry } from '@/lib/mdm-audit'
import { WorkScheduleDrawer } from './WorkScheduleDrawer'
import type { WorkSchedule } from './WorkScheduleDrawer'
import { disableWorkSchedule, enableWorkSchedule } from './WorkScheduleActions'

// ── Types ─────────────────────────────────────────────────────────────────────

type EntityRef = { id: string; nameEn: string }

interface WorkScheduleClientProps {
  initialData:   WorkSchedule[]
  auditHistory:  AuditHistoryEntry[]
  legalEntities: EntityRef[]
}

type StatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE'

// ── Week Indicator ────────────────────────────────────────────────────────────

function WeekIndicator({ schedule }: { schedule: WorkSchedule }) {
  const days = [
    { label: 'M', start: schedule.mondayStart },
    { label: 'T', start: schedule.tuesdayStart },
    { label: 'W', start: schedule.wednesdayStart },
    { label: 'T', start: schedule.thursdayStart },
    { label: 'F', start: schedule.fridayStart },
    { label: 'S', start: schedule.saturdayStart },
    { label: 'S', start: schedule.sundayStart },
  ]
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {days.map((d, i) => (
        <div key={i} style={{
          width: 20, height: 20, borderRadius: 4,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 'var(--text-caption)', fontFamily: 'var(--font-mono)', fontWeight: 700,
          background: d.start ? 'var(--accent)' : 'var(--surface)',
          color: d.start ? '#fff' : 'var(--ink-4)',
          border: d.start ? 'none' : '1px solid var(--border)',
        }}>
          {d.label}
        </div>
      ))}
    </div>
  )
}

// ── Type badge ────────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  STANDARD:  { bg: 'var(--accent-100)', color: 'var(--brand-active)' },
  RAMADAN:   { bg: '#FFF8E1',           color: '#F9A825' },
  SHIFT:     { bg: '#EDE7F6',           color: '#6A1B9A' },
  FLEXIBLE:  { bg: '#E8F5E9',           color: '#2E7D32' },
  PART_TIME: { bg: '#FBE9E7',           color: '#BF360C' },
}

function TypeBadge({ type }: { type: string }) {
  const colors = TYPE_COLORS[type] ?? { bg: 'var(--surface)', color: 'var(--ink-3)' }
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '2px 7px',
      borderRadius: 5,
      fontSize: 'var(--text-caption)',
      fontWeight: 700,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      background: colors.bg,
      color: colors.color,
      whiteSpace: 'nowrap',
    }}>
      {type.replace('_', ' ')}
    </span>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export function WorkScheduleClient({
  initialData,
  auditHistory,
  legalEntities,
}: WorkScheduleClientProps) {
  const router = useRouter()
  const locale = useLocale()
  const [data, setData]                     = useState<WorkSchedule[]>(initialData)
  useEffect(() => { setData(initialData) }, [initialData])
  const [search, setSearch]                 = useState('')
  const [statusFilter, setStatusFilter]     = useState<StatusFilter>('ALL')
  const [entityFilter, setEntityFilter]     = useState('')
  const [drawerOpen, setDrawerOpen]         = useState(false)
  const [editTarget, setEditTarget]         = useState<WorkSchedule | null>(null)
  const [disableTarget, setDisableTarget]   = useState<WorkSchedule | null>(null)
  const [actionPending,  setActionPending]  = useState(false)
  const [actionError,    setActionError]    = useState<string | null>(null)
  const [historyRecord,  setHistoryRecord]  = useState<{ id: string; nameEn: string; nameAr?: string } | null>(null)

  const { sort, handleSort } = useTableSort('scheduleCode', 'asc')

  // ── Derived counts ──────────────────────────────────────────────────────

  const totalCount    = data.length
  const activeCount   = data.filter(r => r.isActive).length
  const inactiveCount = totalCount - activeCount

  // ── Filtered data ───────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return data.filter(ws => {
      if (statusFilter === 'ACTIVE'   && !ws.isActive) return false
      if (statusFilter === 'INACTIVE' && ws.isActive)  return false
      if (entityFilter && ws.legalEntityId !== entityFilter) return false
      if (q && !ws.scheduleCode.toLowerCase().includes(q) &&
               !ws.scheduleNameEn.toLowerCase().includes(q) &&
               !(ws.scheduleNameAr?.toLowerCase().includes(q) ?? false)) return false
      return true
    })
  }, [data, search, statusFilter, entityFilter])

  const sorted = useMemo(() => {
    if (!sort.column || !sort.direction) return filtered
    return [...filtered].sort((a, b) => {
      if (sort.column === 'totalHoursPerWeek') {
        const diff = Number(a.totalHoursPerWeek ?? 0) - Number(b.totalHoursPerWeek ?? 0)
        return sort.direction === 'asc' ? diff : -diff
      }
      const aVal = String((a as Record<string, unknown>)[sort.column!] ?? '')
      const bVal = String((b as Record<string, unknown>)[sort.column!] ?? '')
      const cmp = aVal.localeCompare(bVal, 'en', { sensitivity: 'base' })
      return sort.direction === 'asc' ? cmp : -cmp
    })
  }, [filtered, sort])

  // ── Handlers ────────────────────────────────────────────────────────────

  function handleNew() {
    setEditTarget(null)
    setDrawerOpen(true)
  }

  function handleEdit(ws: WorkSchedule) {
    setEditTarget(ws)
    setDrawerOpen(true)
  }

  function handleSaved() {
    router.refresh()
  }

  async function handleDisableConfirm(reason: string) {
    if (!disableTarget) return
    setActionPending(true)
    setActionError(null)
    try {
      const result = await disableWorkSchedule(disableTarget.id, reason)
      if (result.error) {
        setActionError(result.error)
      } else {
        setData(prev => prev.map(ws =>
          ws.id === disableTarget.id ? { ...ws, isActive: false } : ws,
        ))
        setDisableTarget(null)
      }
    } finally {
      setActionPending(false)
    }
  }

  async function handleEnable(ws: WorkSchedule) {
    setActionPending(true)
    setActionError(null)
    try {
      const result = await enableWorkSchedule(ws.id)
      if (result.error) {
        setActionError(result.error)
      } else {
        setData(prev => prev.map(r =>
          r.id === ws.id ? { ...r, isActive: true } : r,
        ))
      }
    } finally {
      setActionPending(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1200, margin: '0 auto' }}>
      <MdmPageHeader
        titleEn="Work Schedules"
        titleAr="جداول العمل"
        icon={CalendarRange}
        totalCount={totalCount}
        activeCount={activeCount}
        inactiveCount={inactiveCount}
        onNew={handleNew}
        newLabel={locale === 'ar' ? 'جدول جديد' : 'New Schedule'}
      />

      <MdmFilterBar
        search={search}
        onSearchChange={setSearch}
        status={statusFilter}
        onStatusChange={setStatusFilter}
        entityId={entityFilter}
        entities={legalEntities}
        onEntityChange={setEntityFilter}
      />

      {/* Global action error */}
      {actionError && (
        <div style={{
          marginBottom: 12,
          padding: '10px 14px',
          background: '#FBE9E9',
          borderRadius: 8,
          border: '1px solid #E57373',
          fontSize: 'var(--text-body)',
          color: '#C62828',
        }}>
          {actionError}
        </div>
      )}

      {/* ── Table ─────────────────────────────────────────────────────── */}
      <div style={{
        border: '1px solid var(--border)',
        borderRadius: 10,
        overflow: 'hidden',
        background: 'var(--card)',
        marginBottom: 16,
      }}>
        <TableScrollRegion><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-body)' }}>
          <thead>
            <tr style={{ background: 'var(--surface)' }}>
              <SortableHeader label={locale === 'ar' ? 'الرمز' : 'Code'}      column="scheduleCode"      activeColumn={sort.column} direction={sort.direction} onSort={handleSort} />
              <SortableHeader label={locale === 'ar' ? 'الاسم' : 'Name'}      column="scheduleNameEn"    activeColumn={sort.column} direction={sort.direction} onSort={handleSort} />
              <SortableHeader label={locale === 'ar' ? 'النوع' : 'Type'}      column="scheduleType"      activeColumn={sort.column} direction={sort.direction} onSort={handleSort} />
              <th style={{ padding: '10px 14px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', fontSize: 'var(--text-caption)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-3)' }}>{locale === 'ar' ? 'الأسبوع' : 'Week'}</th>
              <SortableHeader label={locale === 'ar' ? 'إجمالي الساعات' : 'Total hrs'} column="totalHoursPerWeek" activeColumn={sort.column} direction={sort.direction} onSort={handleSort} />
              <th style={{ padding: '10px 14px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', fontSize: 'var(--text-caption)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-3)' }}>{locale === 'ar' ? 'رمضان' : 'Ramadan'}</th>
              <SortableHeader label={locale === 'ar' ? 'الحالة' : 'Status'}    column="isActive"          activeColumn={sort.column} direction={sort.direction} onSort={handleSort} />
              <th style={{ padding: '10px 14px', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} style={{
                  textAlign: 'center',
                  padding: '48px 24px',
                  color: 'var(--ink-4)',
                  fontSize: 'var(--text-body)',
                }}>
                  {search || entityFilter || statusFilter !== 'ALL'
                    ? (locale === 'ar' ? 'لا توجد جداول تطابق عوامل التصفية.' : 'No schedules match your filters.')
                    : (locale === 'ar' ? 'لا توجد جداول عمل بعد. انقر "جدول جديد" لإنشاء واحد.' : 'No work schedules yet. Click "New Schedule" to create one.')}
                </td>
              </tr>
            ) : sorted.map((ws, idx) => (
              <tr
                key={ws.id}
                style={{
                  borderTop: idx === 0 ? 'none' : '1px solid var(--border)',
                  background: ws.isActive ? 'transparent' : 'var(--surface)',
                  opacity: ws.isActive ? 1 : 0.7,
                  transition: 'background 0.12s',
                }}
              >
                {/* Code */}
                <td style={{ padding: '12px 14px' }}>
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-caption)',
                    fontWeight: 600,
                    color: 'var(--ink-2)',
                  }}>
                    {ws.scheduleCode}
                  </span>
                  {ws.isDefault && (
                    <span style={{
                      display: 'inline-block',
                      marginLeft: 6,
                      padding: '1px 5px',
                      background: 'var(--accent-100)',
                      color: 'var(--brand-active)',
                      borderRadius: 4,
                      fontSize: 'var(--text-caption)',
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                    }}>
                      {locale === 'ar' ? 'افتراضي' : 'Default'}
                    </span>
                  )}
                </td>

                {/* Name */}
                <td style={{ padding: '12px 14px' }}>
                  <div style={{ fontWeight: 500, color: 'var(--ink-1)' }}>{ws.scheduleNameEn}</div>
                  {ws.scheduleNameAr && (
                    <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', direction: 'rtl', textAlign: 'left', marginTop: 2 }}>
                      {ws.scheduleNameAr}
                    </div>
                  )}
                </td>

                {/* Type */}
                <td style={{ padding: '12px 14px' }}>
                  <TypeBadge type={ws.scheduleType} />
                </td>

                {/* Week visual */}
                <td style={{ padding: '12px 14px' }}>
                  <WeekIndicator schedule={ws} />
                </td>

                {/* Total hrs */}
                <td style={{ padding: '12px 14px' }}>
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 600,
                    fontSize: 'var(--text-body)',
                    color: Number(ws.totalHoursPerWeek ?? 0) > 48 ? '#E65100' : 'var(--ink-2)',
                  }}>
                    {ws.totalHoursPerWeek ? `${parseFloat(ws.totalHoursPerWeek).toFixed(1)}h` : '—'}
                  </span>
                </td>

                {/* Ramadan */}
                <td style={{ padding: '12px 14px' }}>
                  {ws.isRamadanSchedule ? (
                    <span style={{
                      fontSize: 'var(--text-caption)',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      padding: '2px 6px',
                      background: '#FFF8E1',
                      color: '#F9A825',
                      borderRadius: 5,
                    }}>
                      {ws.ramadanHoursPerDay ? `${ws.ramadanHoursPerDay}${locale === 'ar' ? 'س/يوم' : 'h/day'}` : (locale === 'ar' ? 'نعم' : 'Yes')}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--ink-4)', fontSize: 'var(--text-caption)' }}>—</span>
                  )}
                </td>

                {/* Status */}
                <td style={{ padding: '12px 14px' }}>
                  <StatusBadge active={ws.isActive} />
                </td>

                {/* Actions */}
                <td style={{ padding: '12px 14px' }}>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <button
                      onClick={() => handleEdit(ws)}
                      title={tk(locale, 'common.edit')}
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
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => setHistoryRecord({ id: ws.id, nameEn: ws.scheduleNameEn, nameAr: ws.scheduleNameAr ?? undefined })}
                      title={locale === 'ar' ? 'السجل' : 'History'}
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
                      <Clock size={13} />
                    </button>
                    {ws.isActive ? (
                      <button
                        onClick={() => setDisableTarget(ws)}
                        title={locale === 'ar' ? 'تعطيل' : 'Disable'}
                        disabled={actionPending}
                        style={{
                          width: 30, height: 30,
                          border: '1px solid #E57373',
                          borderRadius: 6,
                          background: 'transparent',
                          cursor: actionPending ? 'not-allowed' : 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: '#C62828',
                          opacity: actionPending ? 0.5 : 1,
                        }}
                      >
                        <Ban size={13} />
                      </button>
                    ) : (
                      <button
                        onClick={() => handleEnable(ws)}
                        title={locale === 'ar' ? 'تفعيل' : 'Enable'}
                        disabled={actionPending}
                        style={{
                          width: 30, height: 30,
                          border: '1px solid var(--accent)',
                          borderRadius: 6,
                          background: 'transparent',
                          cursor: actionPending ? 'not-allowed' : 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: 'var(--brand-active)',
                          opacity: actionPending ? 0.5 : 1,
                        }}
                      >
                        <CheckCircle2 size={13} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table></TableScrollRegion>
      </div>

      {/* ── Audit history ─────────────────────────────────────────────── */}
      <MdmChangeHistory
        entries={auditHistory}
        resourceType="work_schedules"
        initialCollapsed
      />

      {/* ── Drawer ────────────────────────────────────────────────────── */}
      <WorkScheduleDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        schedule={editTarget}
        legalEntities={legalEntities}
        onSaved={handleSaved}
      />

      {/* ── Disable dialog ────────────────────────────────────────────── */}
      <DisableConfirmDialog
        open={Boolean(disableTarget)}
        onClose={() => { if (!actionPending) setDisableTarget(null) }}
        onConfirm={handleDisableConfirm}
        entityName={disableTarget?.scheduleNameEn ?? ''}
        warningMessage={locale === 'ar' ? 'سيحتفظ الموظفون المعيّنون على هذا الجدول به حتى إعادة التعيين.' : 'Employees assigned to this schedule will retain it until re-assigned.'}
        isPending={actionPending}
      />

      <RecordHistoryDrawer
        isOpen={!!historyRecord}
        onClose={() => setHistoryRecord(null)}
        recordId={historyRecord?.id ?? ''}
        recordNameEn={historyRecord?.nameEn ?? ''}
        recordNameAr={historyRecord?.nameAr}
        resourceType="work_schedules"
      />
    </div>
  )
}
