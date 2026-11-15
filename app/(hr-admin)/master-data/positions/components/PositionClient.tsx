'use client'

import { TableScrollRegion } from '@/components/ui/TableScrollRegion'
import { useState, useMemo, useTransition, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Briefcase } from 'lucide-react'
import { useLocale } from '@/components/providers/LocaleProvider'
import { useTableSort } from '@/hooks/useTableSort'
import { SortableHeader } from '@/components/ui/SortableHeader'
import { RecordHistoryDrawer } from '@/components/mdm/RecordHistoryDrawer'
import { MdmPageHeader } from '@/components/mdm/MdmPageHeader'
import { MdmFilterBar } from '@/components/mdm/MdmFilterBar'
import { MdmChangeHistory } from '@/components/mdm/MdmChangeHistory'
import { DisableConfirmDialog } from '@/components/mdm/DisableConfirmDialog'
import type { AuditHistoryEntry } from '@/lib/mdm-audit'
import { MdmRowMenu } from '@/components/mdm/MdmRowMenu'
import { PositionDrawer, type PositionRow } from './PositionDrawer'
import { disablePosition, enablePosition } from './PositionActions'

// ── Types ────────────────────────────────────────────────────────────────────

interface LegalEntityOption {
  id:     string
  nameEn: string
}

interface DepartmentOption {
  id:            string
  legalEntityId: string
  nameEn:        string
  code:          string
}

interface JobOption {
  id:         string
  jobCode:    string
  jobTitleEn: string
}

interface GradeOption {
  id:         string
  gradeCode:  string
  gradeNameEn: string
}

interface LocationOption {
  id:     string
  nameEn: string
  code:   string
}

interface PositionClientProps {
  initialData:   PositionRow[]
  auditHistory:  AuditHistoryEntry[]
  legalEntities: LegalEntityOption[]
  departments:   DepartmentOption[]
  jobs:          JobOption[]
  grades:        GradeOption[]
  locations:     LocationOption[]
}

type StatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE'

// ── Status badge variants ─────────────────────────────────────────────────────

const badgeBase: React.CSSProperties = {
  display:       'inline-flex',
  alignItems:    'center',
  gap:           5,
  padding:       '3px 8px',
  borderRadius:  6,
  fontSize:      'var(--text-caption)',
  fontWeight:    600,
  letterSpacing: '0.03em',
  textTransform: 'uppercase',
  whiteSpace:    'nowrap',
}

function PositionStatusBadge({ row, locale }: { row: PositionRow; locale: string }) {
  if (!row.isActive) {
    return (
      <span style={{ ...badgeBase, background: 'var(--surface)', color: 'var(--ink-3)', border: '1px solid var(--border)' }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--ink-4)', flexShrink: 0 }} />
        {locale === 'ar' ? 'غير نشط' : 'Inactive'}
      </span>
    )
  }
  if (row.isOccupied) {
    return (
      <span style={{ ...badgeBase, background: '#FFF3E0', color: '#E65100', border: '1px solid #FFE0B2' }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#FF9800', flexShrink: 0 }} />
        {locale === 'ar' ? 'مشغول' : 'Occupied'}
      </span>
    )
  }
  return (
    <span style={{ ...badgeBase, background: 'var(--accent-100)', color: 'var(--brand-active)' }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent-700)', flexShrink: 0 }} />
      {locale === 'ar' ? 'شاغر' : 'Open'}
    </span>
  )
}

// ── Table styles ─────────────────────────────────────────────────────────────

const tdStyle: React.CSSProperties = {
  padding:       '12px 14px',
  fontSize:      'var(--text-body)',
  color:         'var(--ink-1)',
  borderBottom:  '1px solid var(--border)',
  verticalAlign: 'middle',
}

// ── Component ────────────────────────────────────────────────────────────────

export function PositionClient({
  initialData,
  auditHistory,
  legalEntities,
  departments,
  jobs,
  grades,
  locations,
}: PositionClientProps) {
  const locale = useLocale()
  const [records,       setRecords]       = useState<PositionRow[]>(initialData)
  useEffect(() => { setRecords(initialData) }, [initialData])
  const [search,        setSearch]        = useState('')
  const [statusFilter,  setStatusFilter]  = useState<StatusFilter>('ALL')
  const [entityFilter,  setEntityFilter]  = useState('')
  const [drawerOpen,    setDrawerOpen]    = useState(false)
  const [editRecord,    setEditRecord]    = useState<PositionRow | null>(null)
  const [disableTarget, setDisableTarget] = useState<PositionRow | null>(null)
  const [actionError,   setActionError]   = useState<string | null>(null)
  const [isPending,     startTransition]  = useTransition()
  const [historyRecord, setHistoryRecord] = useState<{ id: string; nameEn: string; nameAr?: string } | null>(null)

  const { sort, handleSort } = useTableSort('positionCode', 'asc')
  const searchParams = useSearchParams()
  const router       = useRouter()

  // Auto-open edit drawer when navigated from org chart with ?edit=<positionId>
  useEffect(() => {
    const editId = searchParams.get('edit')
    if (!editId) return
    const record = records.find(r => r.id === editId)
    if (record) {
      setEditRecord(record)
      setActionError(null)
      setDrawerOpen(true)
      // Clean the URL param without re-render
      router.replace('/master-data/positions', { scroll: false })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Filtered records
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return records.filter(r => {
      // Status filter
      if (statusFilter === 'ACTIVE'   && !r.isActive) return false
      if (statusFilter === 'INACTIVE' && r.isActive)  return false
      // Entity filter
      if (entityFilter && r.legalEntityId !== entityFilter) return false
      // Search
      if (q) {
        return (
          r.positionCode.toLowerCase().includes(q)         ||
          r.positionTitleEn.toLowerCase().includes(q)      ||
          (r.positionTitleAr?.toLowerCase().includes(q) ?? false) ||
          (r.departmentName?.toLowerCase().includes(q) ?? false) ||
          (r.jobTitleEn?.toLowerCase().includes(q) ?? false)
        )
      }
      return true
    })
  }, [records, search, statusFilter, entityFilter])

  const sorted = useMemo(() => {
    if (!sort.column || !sort.direction) return filtered
    return [...filtered].sort((a, b) => {
      const aVal = String((a as unknown as Record<string, unknown>)[sort.column!] ?? '')
      const bVal = String((b as unknown as Record<string, unknown>)[sort.column!] ?? '')
      const cmp = aVal.localeCompare(bVal, 'en', { sensitivity: 'base' })
      return sort.direction === 'asc' ? cmp : -cmp
    })
  }, [filtered, sort])

  // ── Stats
  const totalCount    = records.length
  const activeCount   = records.filter(r => r.isActive).length
  const inactiveCount = totalCount - activeCount

  // Derive position options for "Reports To" select
  const allPositions = useMemo(
    () => records.map(r => ({ id: r.id, positionCode: r.positionCode, positionTitleEn: r.positionTitleEn })),
    [records],
  )

  // ── Actions
  function openNew() {
    setEditRecord(null)
    setActionError(null)
    setDrawerOpen(true)
  }

  function openEdit(r: PositionRow) {
    setEditRecord(r)
    setActionError(null)
    setDrawerOpen(true)
  }

  function handleSaved() {
    router.refresh()
  }

  function handleDisableConfirm(reason: string) {
    if (!disableTarget) return
    const id = disableTarget.id
    setDisableTarget(null)
    startTransition(async () => {
      const result = await disablePosition(id, reason)
      if (result.error) {
        setActionError(result.error)
      } else {
        setRecords(prev => prev.map(r => r.id === id ? { ...r, isActive: false } : r))
      }
    })
  }

  function handleEnable(r: PositionRow) {
    startTransition(async () => {
      const result = await enablePosition(r.id)
      if (result.error) {
        setActionError(result.error)
      } else {
        setRecords(prev => prev.map(p => p.id === r.id ? { ...p, isActive: true } : p))
      }
    })
  }

  return (
    <div>
      <MdmPageHeader
        titleEn="Positions"
        titleAr="المناصب"
        icon={Briefcase}
        totalCount={totalCount}
        activeCount={activeCount}
        inactiveCount={inactiveCount}
        onNew={openNew}
        newLabel={locale === 'ar' ? 'منصب جديد' : 'New Position'}
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

      {actionError && (
        <div style={{
          marginBottom: 14,
          padding: '10px 14px',
          background: '#FBE9E9',
          border: '1px solid #FFCDD2',
          borderRadius: 8,
          fontSize: 'var(--text-body)',
          color: '#C62828',
        }}>
          {actionError}
        </div>
      )}

      {/* ── Table ── */}
      <div style={{
        border:       '1px solid var(--border)',
        borderRadius: 10,
        background:   'var(--card)',
        overflow:     'hidden',
      }}>
        <TableScrollRegion><table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--surface)' }}>
              <SortableHeader label={locale === 'ar' ? 'الرمز' : 'Code'}       column="positionCode"    activeColumn={sort.column} direction={sort.direction} onSort={handleSort} />
              <SortableHeader label={locale === 'ar' ? 'المسمى (إنجليزي)' : 'Title EN'}   column="positionTitleEn" activeColumn={sort.column} direction={sort.direction} onSort={handleSort} />
              <SortableHeader label={locale === 'ar' ? 'القسم' : 'Department'} column="departmentName"  activeColumn={sort.column} direction={sort.direction} onSort={handleSort} />
              <SortableHeader label={locale === 'ar' ? 'الدور الوظيفي' : 'Job'}        column="jobTitleEn"      activeColumn={sort.column} direction={sort.direction} onSort={handleSort} />
              <SortableHeader label={locale === 'ar' ? 'الدرجة' : 'Grade'}      column="gradeCode"       activeColumn={sort.column} direction={sort.direction} onSort={handleSort} />
              <SortableHeader label={locale === 'ar' ? 'الدوام الكامل' : 'FTE'}        column="fteCount"        activeColumn={sort.column} direction={sort.direction} onSort={handleSort} />
              <SortableHeader label={locale === 'ar' ? 'الحالة' : 'Status'}     column="isActive"        activeColumn={sort.column} direction={sort.direction} onSort={handleSort} />
              <th style={{ padding: '10px 14px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', width: 52 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ ...tdStyle, textAlign: 'center', color: 'var(--ink-4)', padding: '32px 0' }}>
                  {locale === 'ar' ? 'لم يتم العثور على مناصب' : 'No positions found'}
                </td>
              </tr>
            ) : sorted.map(r => (
              <tr key={r.id} style={{ opacity: r.isActive ? 1 : 0.6 }}>
                {/* Code */}
                <td style={tdStyle}>
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize:   'var(--text-caption)',
                    background: 'var(--surface)',
                    border:     '1px solid var(--border)',
                    borderRadius: 4,
                    padding:    '2px 6px',
                    color:      'var(--ink-2)',
                  }}>
                    {r.positionCode}
                  </span>
                </td>

                {/* Title EN */}
                <td style={{ ...tdStyle, fontWeight: 500 }}>
                  {r.positionTitleEn}
                  {r.positionTitleAr && (
                    <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', direction: 'rtl', textAlign: 'left', marginTop: 2 }}>
                      {r.positionTitleAr}
                    </div>
                  )}
                </td>

                {/* Department */}
                <td style={{ ...tdStyle, fontSize: 'var(--text-caption)', color: 'var(--ink-2)' }}>
                  {r.departmentName ?? r.departmentId}
                </td>

                {/* Job */}
                <td style={{ ...tdStyle, fontSize: 'var(--text-caption)', color: 'var(--ink-2)' }}>
                  {r.jobTitleEn ?? r.jobId}
                </td>

                {/* Grade */}
                <td style={{ ...tdStyle, fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>
                  {r.gradeCode ?? <span style={{ color: 'var(--ink-4)' }}>—</span>}
                </td>

                {/* FTE */}
                <td style={{ ...tdStyle, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)', fontWeight: 600 }}>
                  {parseFloat(r.fteCount).toFixed(2)}
                </td>

                {/* Status */}
                <td style={tdStyle}>
                  <PositionStatusBadge row={r} locale={locale} />
                </td>

                {/* Actions */}
                <td style={{ ...tdStyle, textAlign: 'center', padding: '8px 10px' }}>
                  <MdmRowMenu
                    isActive={r.isActive}
                    onEdit={() => openEdit(r)}
                    onHistory={() => setHistoryRecord({ id: r.id, nameEn: r.positionTitleEn, nameAr: r.positionTitleAr ?? undefined })}
                    onDisable={() => setDisableTarget(r)}
                    onEnable={() => handleEnable(r)}
                    isPending={isPending}
                    canDisable={!r.isOccupied}
                    canDisableTitle="BR-POS-003: Cannot disable an occupied position"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table></TableScrollRegion>
      </div>

      {/* ── Change History ── */}
      <MdmChangeHistory
        entries={auditHistory}
        resourceType="positions"
        initialCollapsed
      />

      {/* ── Drawer ── */}
      <PositionDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        editRecord={editRecord}
        legalEntities={legalEntities}
        departments={departments}
        jobs={jobs}
        grades={grades}
        locations={locations}
        allPositions={allPositions}
        onSaved={handleSaved}
      />

      {/* ── History Drawer ── */}
      <RecordHistoryDrawer
        isOpen={!!historyRecord}
        onClose={() => setHistoryRecord(null)}
        recordId={historyRecord?.id ?? ''}
        recordNameEn={historyRecord?.nameEn ?? ''}
        recordNameAr={historyRecord?.nameAr}
        resourceType="positions"
      />

      {/* ── Disable Dialog ── */}
      <DisableConfirmDialog
        open={disableTarget !== null}
        onClose={() => setDisableTarget(null)}
        onConfirm={handleDisableConfirm}
        entityName={disableTarget ? `${disableTarget.positionCode} — ${disableTarget.positionTitleEn}` : ''}
        warningMessage={locale === 'ar' ? 'سيتم وضع علامة على المنصب كغير نشط. لا يمكن التراجع عن ذلك أثناء تعيين موظفين عليه.' : 'The position will be marked as inactive. This cannot be undone while employees are assigned.'}
        isPending={isPending}
      />
    </div>
  )
}
