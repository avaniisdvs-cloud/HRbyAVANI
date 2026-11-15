'use client'

import { TableScrollRegion } from '@/components/ui/TableScrollRegion'
import { useState, useMemo, useTransition } from 'react'
import { Tag } from 'lucide-react'
import { useLocale } from '@/components/providers/LocaleProvider'
import { useTableSort } from '@/hooks/useTableSort'
import { SortableHeader } from '@/components/ui/SortableHeader'
import { RecordHistoryDrawer } from '@/components/mdm/RecordHistoryDrawer'
import { MdmPageHeader } from '@/components/mdm/MdmPageHeader'
import { MdmFilterBar } from '@/components/mdm/MdmFilterBar'
import { MdmChangeHistory } from '@/components/mdm/MdmChangeHistory'
import { StatusBadge } from '@/components/mdm/StatusBadge'
import { DisableConfirmDialog } from '@/components/mdm/DisableConfirmDialog'
import type { AuditHistoryEntry } from '@/lib/mdm-audit'
import { MdmRowMenu } from '@/components/mdm/MdmRowMenu'
import { LeaveTypeDrawer, type LeaveTypeRow } from './LeaveTypeDrawer'
import { disableLeaveType, enableLeaveType } from './LeaveTypeActions'

// ── Types ─────────────────────────────────────────────────────────────────────

interface LegalEntityOption { id: string; nameEn: string }

interface LeaveTypeClientProps {
  initialData:   LeaveTypeRow[]
  auditHistory:  AuditHistoryEntry[]
  legalEntities: LegalEntityOption[]
}

type StatusFilter    = 'ALL' | 'ACTIVE' | 'INACTIVE'
type StatutoryFilter = 'ALL' | 'STATUTORY' | 'CUSTOM'

// ── Helpers ───────────────────────────────────────────────────────────────────

const PAY_TYPE_LABELS: Record<string, string> = {
  FULL_PAY: 'Full Pay',
  HALF_PAY: 'Half Pay',
  NO_PAY:   'No Pay',
  TIERED:   'Tiered',
}

const PAY_TYPE_LABELS_AR: Record<string, string> = {
  FULL_PAY: 'أجر كامل',
  HALF_PAY: 'نصف أجر',
  NO_PAY:   'بدون أجر',
  TIERED:   'متدرج',
}

const PAY_TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  FULL_PAY: { bg: '#e8f5e9', color: '#2e7d32' },
  HALF_PAY: { bg: '#fff8e1', color: '#f57f17' },
  TIERED:   { bg: '#e3f2fd', color: '#1565c0' },
  NO_PAY:   { bg: 'var(--surface)', color: 'var(--ink-3)' },
}

// ── Styles ────────────────────────────────────────────────────────────────────

const thStyle: React.CSSProperties = {
  padding:       '10px 14px',
  textAlign:     'left',
  fontSize:      'var(--text-caption)',
  fontWeight:    700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color:         'var(--ink-3)',
  borderBottom:  '1px solid var(--border)',
  whiteSpace:    'nowrap',
}

const tdStyle: React.CSSProperties = {
  padding:       '11px 14px',
  fontSize:      'var(--text-body)',
  color:         'var(--ink-1)',
  borderBottom:  '1px solid var(--border)',
  verticalAlign: 'middle',
}

// ── Main Component ────────────────────────────────────────────────────────────

export function LeaveTypeClient({
  initialData,
  auditHistory,
  legalEntities,
}: LeaveTypeClientProps) {
  const locale = useLocale()
  const { sort, handleSort } = useTableSort('typeCode', 'asc')

  const [records,         setRecords]         = useState<LeaveTypeRow[]>(initialData)
  const [search,          setSearch]          = useState('')
  const [statusFilter,    setStatusFilter]    = useState<StatusFilter>('ALL')
  const [statutoryFilter, setStatutoryFilter] = useState<StatutoryFilter>('ALL')
  const [entityFilter,    setEntityFilter]    = useState('')
  const [drawerOpen,      setDrawerOpen]      = useState(false)
  const [editRecord,      setEditRecord]      = useState<LeaveTypeRow | null>(null)
  const [disableTarget,   setDisableTarget]   = useState<LeaveTypeRow | null>(null)
  const [actionError,     setActionError]     = useState<string | null>(null)
  const [isPending,       startTransition]    = useTransition()
  const [historyRecord,   setHistoryRecord]   = useState<{ id: string; nameEn: string; nameAr?: string } | null>(null)

  // ── Filtering ─────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return records.filter(r => {
      if (statusFilter === 'ACTIVE'   && !r.isActive) return false
      if (statusFilter === 'INACTIVE' && r.isActive)  return false
      if (statutoryFilter === 'STATUTORY' && !r.isStatutory) return false
      if (statutoryFilter === 'CUSTOM'    && r.isStatutory)  return false
      if (entityFilter && r.legalEntityId !== entityFilter) return false
      if (q) return (
        r.typeCode.toLowerCase().includes(q)   ||
        r.typeNameEn.toLowerCase().includes(q) ||
        (r.typeNameAr?.toLowerCase().includes(q) ?? false)
      )
      return true
    })
  }, [records, search, statusFilter, statutoryFilter, entityFilter])

  const sorted = useMemo(() => {
    if (!sort.column || !sort.direction) return filtered
    return [...filtered].sort((a, b) => {
      if (sort.column === 'maxDaysPerYear' || sort.column === 'minServiceMonths') {
        const diff = Number(a[sort.column as keyof LeaveTypeRow] ?? 0) - Number(b[sort.column as keyof LeaveTypeRow] ?? 0)
        return sort.direction === 'asc' ? diff : -diff
      }
      const aVal = String((a as unknown as Record<string, unknown>)[sort.column!] ?? '')
      const bVal = String((b as unknown as Record<string, unknown>)[sort.column!] ?? '')
      const cmp  = aVal.localeCompare(bVal, 'en', { sensitivity: 'base' })
      return sort.direction === 'asc' ? cmp : -cmp
    })
  }, [filtered, sort])

  const totalCount    = records.length
  const activeCount   = records.filter(r => r.isActive).length
  const inactiveCount = totalCount - activeCount

  // ── Actions ───────────────────────────────────────────────────────────────
  function handleDisableConfirm(reason: string) {
    if (!disableTarget) return
    const id = disableTarget.id
    setDisableTarget(null)
    startTransition(async () => {
      const result = await disableLeaveType(id, reason)
      if (result.error) setActionError(result.error)
      else setRecords(prev => prev.map(r => r.id === id ? { ...r, isActive: false } : r))
    })
  }

  function handleEnable(r: LeaveTypeRow) {
    startTransition(async () => {
      const result = await enableLeaveType(r.id)
      if (result.error) setActionError(result.error)
      else setRecords(prev => prev.map(lt => lt.id === r.id ? { ...lt, isActive: true } : lt))
    })
  }

  return (
    <div>
      <MdmPageHeader
        titleEn="Leave Types"
        titleAr="أنواع الإجازات"
        icon={Tag}
        totalCount={totalCount}
        activeCount={activeCount}
        inactiveCount={inactiveCount}
        onNew={() => { setEditRecord(null); setActionError(null); setDrawerOpen(true) }}
        newLabel={locale === 'ar' ? 'نوع إجازة جديد' : 'New Leave Type'}
      />

      {/* ── Filter bar ── */}
      <MdmFilterBar
        search={search}
        onSearchChange={setSearch}
        status={statusFilter}
        onStatusChange={setStatusFilter}
        entityId={entityFilter}
        entities={legalEntities}
        onEntityChange={setEntityFilter}
        extra={
          <div style={{ display: 'flex', border: '1.5px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            {(['ALL', 'STATUTORY', 'CUSTOM'] as StatutoryFilter[]).map((s, i) => (
              <button key={s} onClick={() => setStatutoryFilter(s)} style={{
                height: 36, padding: '0 12px',
                borderTopWidth: "0px",
                borderTopStyle: "none",
                borderTopColor: "currentColor",
                borderRightWidth: "0px",
                borderRightStyle: "none",
                borderRightColor: "currentColor",
                borderBottomWidth: "0px",
                borderBottomStyle: "none",
                borderBottomColor: "currentColor",
                borderLeftWidth: (i > 0) ? "1px" : "0px",
                borderLeftStyle: (i > 0) ? "solid" : "none",
                borderLeftColor: (i > 0) ? "var(--border)" : "currentColor",
                background: statutoryFilter === s ? 'var(--accent)' : 'var(--card)',
                color:      statutoryFilter === s ? '#fff' : 'var(--ink-2)',
                fontSize: 'var(--text-caption)', fontWeight: statutoryFilter === s ? 600 : 400, cursor: 'pointer',
                transition: 'background 0.12s',
              }}>
                {locale === 'ar'
                  ? (s === 'ALL' ? 'الكل' : s === 'STATUTORY' ? 'قانوني' : 'مخصص')
                  : (s.charAt(0) + s.slice(1).toLowerCase())}
              </button>
            ))}
          </div>
        }
      />

      {actionError && (
        <div style={{ marginBottom: 14, padding: '10px 14px', background: '#FBE9E9', border: '1px solid #FFCDD2', borderRadius: 8, fontSize: 'var(--text-body)', color: '#C62828' }}>
          {actionError}
        </div>
      )}

      {/* ── Table ── */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--card)', overflow: 'hidden' }}>
        <TableScrollRegion><table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--surface)' }}>
              <SortableHeader label={locale === 'ar' ? 'الرمز' : 'Code'}        column="typeCode"         activeColumn={sort.column} direction={sort.direction} onSort={handleSort} />
              <SortableHeader label={locale === 'ar' ? 'الاسم (إنجليزي)' : 'Name (EN)'}   column="typeNameEn"       activeColumn={sort.column} direction={sort.direction} onSort={handleSort} />
              <SortableHeader label={locale === 'ar' ? 'الاسم (عربي)' : 'Name (AR)'}   column="typeNameAr"       activeColumn={sort.column} direction={sort.direction} onSort={handleSort} />
              <SortableHeader label={locale === 'ar' ? 'نوع الأجر' : 'Pay Type'}    column="isPaid"           activeColumn={sort.column} direction={sort.direction} onSort={handleSort} />
              <SortableHeader label={locale === 'ar' ? 'الحد الأقصى للأيام' : 'Max Days'}    column="maxDaysPerYear"   activeColumn={sort.column} direction={sort.direction} onSort={handleSort} />
              <SortableHeader label={locale === 'ar' ? 'الحد الأدنى للخدمة' : 'Min Service'} column="minServiceMonths" activeColumn={sort.column} direction={sort.direction} onSort={handleSort} />
              <SortableHeader label={locale === 'ar' ? 'قانوني' : 'Statutory'}   column="isStatutory"      activeColumn={sort.column} direction={sort.direction} onSort={handleSort} />
              <SortableHeader label={locale === 'ar' ? 'الحالة' : 'Status'}      column="isActive"         activeColumn={sort.column} direction={sort.direction} onSort={handleSort} />
              <th style={{ ...thStyle, textAlign: 'center', width: 52 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ ...tdStyle, textAlign: 'center', color: 'var(--ink-4)', padding: '40px 0' }}>
                  {locale === 'ar' ? 'لم يتم العثور على أنواع إجازات' : 'No leave types found'}
                </td>
              </tr>
            ) : sorted.map(r => {
              const payColors = PAY_TYPE_COLORS[r.isPaid] ?? PAY_TYPE_COLORS.NO_PAY
              return (
                <tr
                  key={r.id}
                  style={{ opacity: r.isActive ? 1 : 0.55 }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 3%, transparent)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {/* Code */}
                  <td style={tdStyle}>
                    <span style={{
                      fontFamily:   'var(--font-mono)',
                      fontSize:     'var(--text-caption)',
                      background:   'var(--surface)',
                      border:       '1px solid var(--border)',
                      borderRadius: 4,
                      padding:      '2px 6px',
                      color:        'var(--ink-2)',
                      fontWeight:   600,
                    }}>
                      {r.typeCode}
                    </span>
                  </td>

                  {/* Name EN */}
                  <td style={{ ...tdStyle, fontWeight: 500 }}>{r.typeNameEn}</td>

                  {/* Name AR */}
                  <td style={{ ...tdStyle, direction: 'rtl', textAlign: 'right' }}>
                    {r.typeNameAr ?? <span style={{ color: 'var(--ink-4)' }}>—</span>}
                  </td>

                  {/* Pay Type */}
                  <td style={tdStyle}>
                    <span style={{
                      display: 'inline-block', padding: '2px 9px', borderRadius: 20,
                      fontSize: 'var(--text-caption)', fontWeight: 600,
                      background: payColors.bg, color: payColors.color,
                    }}>
                      {(locale === 'ar' ? PAY_TYPE_LABELS_AR[r.isPaid] : PAY_TYPE_LABELS[r.isPaid]) ?? r.isPaid}
                    </span>
                  </td>

                  {/* Max Days */}
                  <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-body)' }}>
                    {r.maxDaysPerYear != null
                      ? <strong>{Number(r.maxDaysPerYear)}</strong>
                      : <span style={{ color: 'var(--ink-4)' }}>∞</span>}
                  </td>

                  {/* Min Service */}
                  <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--ink-2)', fontSize: 'var(--text-caption)' }}>
                    {r.minServiceMonths > 0
                      ? `${r.minServiceMonths} ${locale === 'ar' ? 'شهر' : 'mo'}`
                      : <span style={{ color: 'var(--ink-4)' }}>—</span>}
                  </td>

                  {/* Statutory badge */}
                  <td style={tdStyle}>
                    {r.isStatutory
                      ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, fontSize: 'var(--text-caption)', fontWeight: 600, background: '#fff8e1', color: '#e65100', border: '1px solid #ffcc80' }}>
                          ⚖ {locale === 'ar' ? 'قانوني' : 'Statutory'}
                        </span>
                      : <span style={{ color: 'var(--ink-4)', fontSize: 'var(--text-caption)' }}>{locale === 'ar' ? 'مخصص' : 'Custom'}</span>
                    }
                  </td>

                  {/* Status */}
                  <td style={tdStyle}>
                    <StatusBadge active={r.isActive} />
                  </td>

                  {/* ··· Menu */}
                  <td style={{ ...tdStyle, textAlign: 'center', padding: '8px 10px' }}>
                    <MdmRowMenu
                      isActive={r.isActive}
                      onEdit={() => { setEditRecord(r); setActionError(null); setDrawerOpen(true) }}
                      onHistory={() => setHistoryRecord({ id: r.id, nameEn: r.typeNameEn, nameAr: r.typeNameAr ?? undefined })}
                      onDisable={() => setDisableTarget(r)}
                      onEnable={() => handleEnable(r)}
                      isPending={isPending}
                      noToggle={r.isSystemRecord}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table></TableScrollRegion>
      </div>

      {/* ── Audit Change History (page-level) ── */}
      <MdmChangeHistory
        entries={auditHistory}
        resourceType="absence_types"
        initialCollapsed
      />

      {/* ── Edit Drawer ── */}
      <LeaveTypeDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        editRecord={editRecord}
        legalEntities={legalEntities}
        onSaved={() => window.location.reload()}
      />

      {/* ── Per-record Audit History Drawer ── */}
      <RecordHistoryDrawer
        isOpen={!!historyRecord}
        onClose={() => setHistoryRecord(null)}
        recordId={historyRecord?.id ?? ''}
        recordNameEn={historyRecord?.nameEn ?? ''}
        recordNameAr={historyRecord?.nameAr}
        resourceType="absence_types"
      />

      {/* ── Disable Confirm Dialog ── */}
      <DisableConfirmDialog
        open={disableTarget !== null}
        onClose={() => setDisableTarget(null)}
        onConfirm={handleDisableConfirm}
        entityName={disableTarget ? `${disableTarget.typeCode} — ${disableTarget.typeNameEn}` : ''}
        warningMessage={locale === 'ar' ? 'لن تتأثر أي طلبات إجازة نشطة لهذا النوع. لن يُسمح بالطلبات المستقبلية.' : 'Any active leave requests for this type will remain unaffected. Future requests will not be permitted.'}
        isPending={isPending}
      />
    </div>
  )
}
