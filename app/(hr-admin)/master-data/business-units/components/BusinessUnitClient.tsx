'use client'

import { TableScrollRegion } from '@/components/ui/TableScrollRegion'
import { useState, useMemo, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Boxes } from 'lucide-react'
import { useLocale } from '@/components/providers/LocaleProvider'
import { useTableSort } from '@/hooks/useTableSort'
import { SortableHeader } from '@/components/ui/SortableHeader'
import { RecordHistoryDrawer } from '@/components/mdm/RecordHistoryDrawer'
import { MdmPageHeader } from '@/components/mdm/MdmPageHeader'
import { MdmFilterBar } from '@/components/mdm/MdmFilterBar'
import { MdmChangeHistory } from '@/components/mdm/MdmChangeHistory'
import { StatusBadge } from '@/components/mdm/StatusBadge'
import { DisableConfirmDialog } from '@/components/mdm/DisableConfirmDialog'
import { MdmRowMenu } from '@/components/mdm/MdmRowMenu'
import type { AuditHistoryEntry } from '@/lib/mdm-audit'
import { BusinessUnitDrawer, type BusinessUnitRow } from './BusinessUnitDrawer'
import { disableBusinessUnit, enableBusinessUnit } from './BusinessUnitActions'

// ── Types ─────────────────────────────────────────────────────────────────────

interface LegalEntityOption {
  id:     string
  nameEn: string
}

interface BusinessUnitClientProps {
  initialData:   BusinessUnitRow[]
  auditHistory:  AuditHistoryEntry[]
  legalEntities: LegalEntityOption[]
}

type StatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE'

// ── Helpers ───────────────────────────────────────────────────────────────────

const tdStyle: React.CSSProperties = {
  padding:       '12px 14px',
  fontSize:      'var(--text-body)',
  color:         'var(--ink-1)',
  borderBottom:  '1px solid var(--border)',
  verticalAlign: 'middle',
}

// ── Component ─────────────────────────────────────────────────────────────────

export function BusinessUnitClient({
  initialData,
  auditHistory,
  legalEntities,
}: BusinessUnitClientProps) {
  const router = useRouter()
  const locale = useLocale()
  const [records,       setRecords]       = useState<BusinessUnitRow[]>(initialData)
  useEffect(() => { setRecords(initialData) }, [initialData])
  const [search,        setSearch]        = useState('')
  const [statusFilter,  setStatusFilter]  = useState<StatusFilter>('ALL')
  const [entityFilter,  setEntityFilter]  = useState('')
  const [drawerOpen,    setDrawerOpen]    = useState(false)
  const [editRecord,    setEditRecord]    = useState<BusinessUnitRow | null>(null)
  const [disableTarget, setDisableTarget] = useState<BusinessUnitRow | null>(null)
  const [actionError,   setActionError]   = useState<string | null>(null)
  const [isPending,     startTransition]  = useTransition()
  const [historyRecord, setHistoryRecord] = useState<{ id: string; nameEn: string; nameAr?: string } | null>(null)

  const { sort, handleSort } = useTableSort('code', 'asc')

  // ── Entity name lookup ────────────────────────────────────────────────────
  const entityMap = useMemo(() => {
    const m = new Map<string, string>()
    legalEntities.forEach(le => m.set(le.id, le.nameEn))
    return m
  }, [legalEntities])

  // ── Filtered records ──────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return records.filter(r => {
      if (statusFilter === 'ACTIVE'   && !r.isActive) return false
      if (statusFilter === 'INACTIVE' && r.isActive)  return false
      if (entityFilter && r.legalEntityId !== entityFilter) return false
      if (q) {
        return (
          r.code.toLowerCase().includes(q)   ||
          r.nameEn.toLowerCase().includes(q) ||
          r.nameAr.toLowerCase().includes(q) ||
          (r.glSegmentCode?.toLowerCase().includes(q) ?? false) ||
          (entityMap.get(r.legalEntityId)?.toLowerCase().includes(q) ?? false)
        )
      }
      return true
    })
  }, [records, search, statusFilter, entityFilter, entityMap])

  const sorted = useMemo(() => {
    if (!sort.column || !sort.direction) return filtered
    return [...filtered].sort((a, b) => {
      let aVal: string
      let bVal: string
      if (sort.column === 'entityName') {
        aVal = entityMap.get(a.legalEntityId) ?? ''
        bVal = entityMap.get(b.legalEntityId) ?? ''
      } else {
        aVal = String((a as unknown as Record<string, unknown>)[sort.column!] ?? '')
        bVal = String((b as unknown as Record<string, unknown>)[sort.column!] ?? '')
      }
      const cmp = aVal.localeCompare(bVal, 'en', { sensitivity: 'base' })
      return sort.direction === 'asc' ? cmp : -cmp
    })
  }, [filtered, sort, entityMap])

  // ── Stats ─────────────────────────────────────────────────────────────────
  const totalCount    = records.length
  const activeCount   = records.filter(r => r.isActive).length
  const inactiveCount = totalCount - activeCount

  // ── Handlers ─────────────────────────────────────────────────────────────
  function openNew() {
    setEditRecord(null)
    setActionError(null)
    setDrawerOpen(true)
  }

  function openEdit(r: BusinessUnitRow) {
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
      const result = await disableBusinessUnit(id, reason)
      if (result.error) {
        setActionError(result.error)
      } else {
        setRecords(prev => prev.map(r => r.id === id ? { ...r, isActive: false } : r))
      }
    })
  }

  function handleEnable(r: BusinessUnitRow) {
    startTransition(async () => {
      const result = await enableBusinessUnit(r.id)
      if (result.error) {
        setActionError(result.error)
      } else {
        setRecords(prev => prev.map(d => d.id === r.id ? { ...d, isActive: true } : d))
      }
    })
  }

  return (
    <div>
      <MdmPageHeader
        titleEn="Business Units"
        titleAr="وحدات العمل"
        icon={Boxes}
        totalCount={totalCount}
        activeCount={activeCount}
        inactiveCount={inactiveCount}
        onNew={openNew}
        newLabel={locale === 'ar' ? 'وحدة عمل جديدة' : 'New Business Unit'}
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
          background: 'var(--status-rejected-bg)',
          border: '1px solid var(--status-rejected-dot)',
          borderRadius: 8,
          fontSize: 'var(--text-body)',
          color: 'var(--status-rejected-fg)',
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
              <SortableHeader label={locale === 'ar' ? 'الرمز' : 'Code'}       column="code"         activeColumn={sort.column} direction={sort.direction} onSort={handleSort} />
              <SortableHeader label={locale === 'ar' ? 'الاسم (إنجليزي)' : 'Name EN'}    column="nameEn"       activeColumn={sort.column} direction={sort.direction} onSort={handleSort} />
              <SortableHeader label={locale === 'ar' ? 'الاسم (عربي)' : 'Name AR'}    column="nameAr"       activeColumn={sort.column} direction={sort.direction} onSort={handleSort} />
              <SortableHeader label={locale === 'ar' ? 'الكيان' : 'Entity'}     column="entityName"   activeColumn={sort.column} direction={sort.direction} onSort={handleSort} />
              <SortableHeader label={locale === 'ar' ? 'قطاع دفتر الأستاذ' : 'GL Segment'} column="glSegmentCode" activeColumn={sort.column} direction={sort.direction} onSort={handleSort} />
              <SortableHeader label={locale === 'ar' ? 'الحالة' : 'Status'}     column="isActive"     activeColumn={sort.column} direction={sort.direction} onSort={handleSort} />
              <th style={{ padding: '10px 14px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', width: 52 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ ...tdStyle, textAlign: 'center', color: 'var(--ink-4)', padding: '32px 0' }}>
                  {records.length === 0
                    ? (locale === 'ar' ? 'لا توجد وحدات عمل بعد. أنشئ الوحدة الأولى.' : 'No business units yet. Create the first one.')
                    : (locale === 'ar' ? 'لا توجد وحدات عمل تطابق عوامل التصفية الحالية.' : 'No business units match the current filters.')}
                </td>
              </tr>
            ) : sorted.map(r => (
              <tr key={r.id} style={{ opacity: r.isActive ? 1 : 0.6 }}>

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
                  }}>
                    {r.code}
                  </span>
                </td>

                {/* Name EN */}
                <td style={{ ...tdStyle, fontWeight: 500 }}>{r.nameEn}</td>

                {/* Name AR */}
                <td style={{ ...tdStyle, direction: 'rtl', textAlign: 'right', fontFamily: 'var(--font-sans)' }}>
                  {r.nameAr}
                </td>

                {/* Entity */}
                <td style={{ ...tdStyle, color: 'var(--ink-2)', fontSize: 'var(--text-caption)' }}>
                  {entityMap.get(r.legalEntityId) ?? r.legalEntityId}
                </td>

                {/* GL Segment */}
                <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>
                  {r.glSegmentCode ?? <span style={{ color: 'var(--ink-4)' }}>—</span>}
                </td>

                {/* Status */}
                <td style={tdStyle}>
                  <StatusBadge active={r.isActive} />
                </td>

                {/* Actions */}
                <td style={{ ...tdStyle, textAlign: 'center', padding: '8px 10px' }}>
                  <MdmRowMenu
                    isActive={r.isActive}
                    onEdit={() => openEdit(r)}
                    onHistory={() => setHistoryRecord({ id: r.id, nameEn: r.nameEn, nameAr: r.nameAr })}
                    onDisable={() => setDisableTarget(r)}
                    onEnable={() => handleEnable(r)}
                    isPending={isPending}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table></TableScrollRegion>
      </div>

      {sorted.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 'var(--text-caption)', color: 'var(--ink-4)' }}>
          {locale === 'ar' ? `عرض ${sorted.length} من ${totalCount} وحدة عمل` : `Showing ${sorted.length} of ${totalCount} business units`}
        </div>
      )}

      {/* ── Change History ── */}
      <MdmChangeHistory
        entries={auditHistory}
        resourceType="business_units"
        initialCollapsed
      />

      {/* ── Drawer ── */}
      <BusinessUnitDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        editRecord={editRecord}
        legalEntities={legalEntities}
        onSaved={handleSaved}
      />

      {/* ── History Drawer ── */}
      <RecordHistoryDrawer
        isOpen={!!historyRecord}
        onClose={() => setHistoryRecord(null)}
        recordId={historyRecord?.id ?? ''}
        recordNameEn={historyRecord?.nameEn ?? ''}
        recordNameAr={historyRecord?.nameAr}
        resourceType="business_units"
      />

      {/* ── Disable Dialog ── */}
      <DisableConfirmDialog
        open={disableTarget !== null}
        onClose={() => setDisableTarget(null)}
        onConfirm={handleDisableConfirm}
        entityName={disableTarget ? `${disableTarget.code} — ${disableTarget.nameEn}` : ''}
        warningMessage={locale === 'ar' ? 'ستظل أي أقسام معيّنة على وحدة العمل هذه دون تغيير حتى يتم تحديثها يدويًا.' : 'Any departments assigned to this business unit will remain unchanged until manually updated.'}
        isPending={isPending}
      />
    </div>
  )
}
