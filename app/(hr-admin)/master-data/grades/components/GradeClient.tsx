'use client'

import { TableScrollRegion } from '@/components/ui/TableScrollRegion'
import { useState, useTransition, useMemo, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Layers } from 'lucide-react'
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
import { GradeDrawer } from './GradeDrawer'
import { disableGrade, enableGrade } from './GradeActions'
import type { AuditHistoryEntry } from '@/lib/mdm-audit'
import type { Grade } from '@/drizzle/schema'

// ── Types ──────────────────────────────────────────────────────────────────

interface LegalEntityOption {
  id:     string
  nameEn: string
}

interface GradeClientProps {
  initialData:   Grade[]
  auditHistory:  AuditHistoryEntry[]
  legalEntities: LegalEntityOption[]
}

type StatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE'

// ── Salary bar visualisation ───────────────────────────────────────────────

function SalaryCell({ row }: { row: Grade }) {
  const min = row.minSalary ? Number(row.minSalary) : null
  const max = row.maxSalary ? Number(row.maxSalary) : null
  const mid = row.midSalary ? Number(row.midSalary) : null

  const rangeText =
    min != null && max != null
      ? `AED ${min.toLocaleString()} – ${max.toLocaleString()}/mo`
      : '—'

  const midPct =
    min != null && max != null && mid != null && max > min
      ? ((mid - min) / (max - min)) * 100
      : null

  return (
    <div>
      <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-2)' }}>{rangeText}</div>
      {midPct != null && (
        <div style={{ height: 4, background: 'var(--surface)', borderRadius: 2, width: 80, marginTop: 4, position: 'relative' }}>
          <div style={{
            position: 'absolute', left: 0,
            width: `${midPct}%`,
            height: '100%',
            background: 'var(--accent)',
            borderRadius: 2,
          }} />
          <div style={{
            position: 'absolute',
            left: `${midPct}%`,
            top: -2,
            width: 2,
            height: 8,
            background: 'var(--accent-700)',
            transform: 'translateX(-50%)',
          }} />
        </div>
      )}
    </div>
  )
}

// ── GradeClient ────────────────────────────────────────────────────────────

export function GradeClient({ initialData, auditHistory, legalEntities }: GradeClientProps) {
  const router = useRouter()
  const locale = useLocale()
  const [data,        setData]        = useState<Grade[]>(initialData)
  useEffect(() => { setData(initialData) }, [initialData])
  const [search,      setSearch]      = useState('')
  const [status,      setStatus]      = useState<StatusFilter>('ALL')
  const [entityId,    setEntityId]    = useState('')
  const [drawerOpen,  setDrawerOpen]  = useState(false)
  const [editRow,     setEditRow]     = useState<Grade | null>(null)
  const [disableRow,  setDisableRow]  = useState<Grade | null>(null)
  const [isPending,   startTransition] = useTransition()
  const [toastMsg,    setToastMsg]    = useState<string | null>(null)
  const [historyRecord, setHistoryRecord] = useState<{ id: string; nameEn: string; nameAr?: string } | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { sort, handleSort } = useTableSort('gradeLevel', 'asc')

  // ── Entity name lookup map ─────────────────────────────────────────────
  const entityMap = useMemo(() => {
    const m = new Map<string, string>()
    legalEntities.forEach(le => m.set(le.id, le.nameEn))
    return m
  }, [legalEntities])

  // ── Filtered rows ──────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return data.filter(row => {
      if (status === 'ACTIVE'   && !row.isActive) return false
      if (status === 'INACTIVE' &&  row.isActive) return false
      if (entityId && row.legalEntityId !== entityId) return false
      if (q && ![
        row.gradeCode,
        row.gradeNameEn,
        row.gradeNameAr ?? '',
        String(row.gradeLevel),
      ].some(v => v.toLowerCase().includes(q))) return false
      return true
    })
  }, [data, search, status, entityId])

  const sorted = useMemo(() => {
    if (!sort.column || !sort.direction) return filtered
    return [...filtered].sort((a, b) => {
      let aVal: string | number
      let bVal: string | number
      if (sort.column === 'gradeLevel') {
        aVal = a.gradeLevel ?? 0
        bVal = b.gradeLevel ?? 0
        const diff = (aVal as number) - (bVal as number)
        return sort.direction === 'asc' ? diff : -diff
      }
      if (sort.column === 'entityName') {
        aVal = entityMap.get(a.legalEntityId ?? '') ?? ''
        bVal = entityMap.get(b.legalEntityId ?? '') ?? ''
      } else {
        aVal = String((a as Record<string, unknown>)[sort.column!] ?? '')
        bVal = String((b as Record<string, unknown>)[sort.column!] ?? '')
      }
      const cmp = String(aVal).localeCompare(String(bVal), 'en', { sensitivity: 'base' })
      return sort.direction === 'asc' ? cmp : -cmp
    })
  }, [filtered, sort, entityMap])

  // ── Counts ─────────────────────────────────────────────────────────────
  const totalCount    = data.length
  const activeCount   = data.filter(r => r.isActive).length
  const inactiveCount = data.filter(r => !r.isActive).length

  // ── Toast helper ───────────────────────────────────────────────────────
  function showToast(msg: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToastMsg(msg)
    toastTimer.current = setTimeout(() => setToastMsg(null), 3000)
  }

  // ── Handlers ───────────────────────────────────────────────────────────
  function handleNew() {
    setEditRow(null)
    setDrawerOpen(true)
  }

  function handleEdit(row: Grade) {
    setEditRow(row)
    setDrawerOpen(true)
  }

  function handleDisableRequest(row: Grade) {
    setDisableRow(row)
  }

  function handleEnable(row: Grade) {
    startTransition(async () => {
      const result = await enableGrade(row.id)
      if (result.success) {
        setData(prev => prev.map(r => r.id === row.id ? { ...r, isActive: true } : r))
        showToast(locale === 'ar' ? `تم تفعيل الدرجة ${row.gradeCode}.` : `Grade ${row.gradeCode} re-enabled.`)
      }
    })
  }

  function handleConfirmDisable(reason: string) {
    if (!disableRow) return
    startTransition(async () => {
      const result = await disableGrade(disableRow.id, reason)
      if (result.success) {
        setData(prev => prev.map(r => r.id === disableRow.id ? { ...r, isActive: false } : r))
        showToast(locale === 'ar' ? `تم تعطيل الدرجة ${disableRow.gradeCode}.` : `Grade ${disableRow.gradeCode} disabled.`)
      }
      setDisableRow(null)
    })
  }

  function handleDrawerSuccess() {
    showToast(editRow ? (locale === 'ar' ? 'تم تحديث الدرجة.' : 'Grade updated.') : (locale === 'ar' ? 'تم إنشاء الدرجة.' : 'Grade created.'))
    router.refresh()
  }

  return (
    <div>
      {/* Header */}
      <MdmPageHeader
        titleEn="Grades"
        titleAr="الدرجات الوظيفية"
        icon={Layers}
        totalCount={totalCount}
        activeCount={activeCount}
        inactiveCount={inactiveCount}
        onNew={handleNew}
        newLabel={locale === 'ar' ? 'درجة جديدة' : 'New Grade'}
      />

      {/* Filter bar */}
      <MdmFilterBar
        search={search}
        onSearchChange={setSearch}
        status={status}
        onStatusChange={setStatus}
        entityId={entityId}
        entities={legalEntities}
        onEntityChange={setEntityId}
      />

      {/* Table */}
      <div style={{
        border: '1px solid var(--border)',
        borderRadius: 10,
        overflow: 'hidden',
        background: 'var(--card)',
      }}>
        <TableScrollRegion><table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <colgroup>
            <col style={{ width: 100 }} />
            <col />
            <col style={{ width: 80 }} />
            <col style={{ width: 160 }} />
            <col style={{ width: 130 }} />
            <col />
            <col style={{ width: 100 }} />
            <col style={{ width: 215 }} />
          </colgroup>
          <thead>
            <tr style={{ background: 'var(--surface)' }}>
              <SortableHeader label={locale === 'ar' ? 'الرمز' : 'Code'}          column="gradeCode"        activeColumn={sort.column} direction={sort.direction} onSort={handleSort} />
              <SortableHeader label={locale === 'ar' ? 'الاسم (إنجليزي)' : 'Name EN'}       column="gradeNameEn"      activeColumn={sort.column} direction={sort.direction} onSort={handleSort} />
              <SortableHeader label={locale === 'ar' ? 'المستوى' : 'Level'}         column="gradeLevel"       activeColumn={sort.column} direction={sort.direction} onSort={handleSort} />
              <SortableHeader label={locale === 'ar' ? 'نطاق الراتب' : 'Salary Range'}  column="minSalary"        activeColumn={sort.column} direction={sort.direction} onSort={handleSort} />
              <SortableHeader label={locale === 'ar' ? 'فترة الإشعار' : 'Notice Period'} column="noticePeriodDays" activeColumn={sort.column} direction={sort.direction} onSort={handleSort} />
              <SortableHeader label={locale === 'ar' ? 'الكيان' : 'Entity'}        column="entityName"       activeColumn={sort.column} direction={sort.direction} onSort={handleSort} />
              <SortableHeader label={locale === 'ar' ? 'الحالة' : 'Status'}        column="isActive"         activeColumn={sort.column} direction={sort.direction} onSort={handleSort} />
              <th style={{ padding: '10px 14px', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}></th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--ink-4)', fontSize: 'var(--text-body)' }}>
                  {data.length === 0 ? (locale === 'ar' ? 'لا توجد درجات بعد. أنشئ الدرجة الأولى.' : 'No grades yet. Create the first one.') : (locale === 'ar' ? 'لا توجد درجات تطابق عوامل التصفية الحالية.' : 'No grades match the current filters.')}
                </td>
              </tr>
            ) : (
              sorted.map(row => (
                <tr
                  key={row.id}
                  style={{
                    borderBottom: '1px solid var(--border)',
                    opacity: row.isActive ? 1 : 0.6,
                  }}
                >
                  {/* Code */}
                  <td style={{ padding: '14px 8px', verticalAlign: 'middle' }}>
                    <span style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 'var(--text-body)',
                      fontWeight: 700,
                      color: 'var(--brand-active)',
                      background: 'var(--accent-100)',
                      padding: '2px 8px',
                      borderRadius: 4,
                    }}>
                      {row.gradeCode}
                    </span>
                  </td>

                  {/* Name EN */}
                  <td style={{ padding: '14px 8px', verticalAlign: 'middle' }}>
                    <div style={{ fontSize: 'var(--text-body)', fontWeight: 500, color: 'var(--ink-1)' }}>
                      {row.gradeNameEn}
                    </div>
                    {row.gradeNameAr && (
                      <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', direction: 'rtl', marginTop: 2 }}>
                        {row.gradeNameAr}
                      </div>
                    )}
                  </td>

                  {/* Grade Level */}
                  <td style={{ padding: '14px 8px', fontSize: 'var(--text-body)', color: 'var(--ink-2)', fontFamily: 'var(--font-mono)', verticalAlign: 'middle' }}>
                    L{row.gradeLevel}
                  </td>

                  {/* Salary Range */}
                  <td style={{ padding: '14px 8px', verticalAlign: 'middle' }}>
                    <SalaryCell row={row} />
                  </td>

                  {/* Notice Period */}
                  <td style={{ padding: '14px 8px', verticalAlign: 'middle' }}>
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
                      {row.noticePeriodDays} {locale === 'ar' ? 'يوم' : 'days'}
                    </span>
                  </td>

                  {/* Entity */}
                  <td style={{ padding: '14px 8px', fontSize: 'var(--text-caption)', color: 'var(--ink-3)', verticalAlign: 'middle' }}>
                    {row.legalEntityId
                      ? (entityMap.get(row.legalEntityId) ?? '—')
                      : <span style={{ fontStyle: 'italic', color: 'var(--ink-4)' }}>{locale === 'ar' ? 'على مستوى المؤسسة' : 'Enterprise-wide'}</span>
                    }
                  </td>

                  {/* Status */}
                  <td style={{ padding: '14px 8px', verticalAlign: 'middle' }}>
                    <StatusBadge active={row.isActive} />
                  </td>

                  {/* Actions */}
                  <td style={{ padding: '8px 10px', verticalAlign: 'middle', textAlign: 'center' }}>
                    <MdmRowMenu
                      isActive={row.isActive}
                      onEdit={() => handleEdit(row)}
                      onHistory={() => setHistoryRecord({ id: row.id, nameEn: row.gradeNameEn, nameAr: row.gradeNameAr ?? undefined })}
                      onDisable={() => handleDisableRequest(row)}
                      onEnable={() => handleEnable(row)}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table></TableScrollRegion>
      </div>

      {/* Row count */}
      {sorted.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 'var(--text-caption)', color: 'var(--ink-4)' }}>
          {locale === 'ar' ? `عرض ${sorted.length} من ${totalCount} درجة` : `Showing ${sorted.length} of ${totalCount} grades`}
        </div>
      )}

      {/* Audit history */}
      <MdmChangeHistory
        entries={auditHistory}
        resourceType="grades"
        initialCollapsed
      />

      {/* History Drawer */}
      <RecordHistoryDrawer
        isOpen={!!historyRecord}
        onClose={() => setHistoryRecord(null)}
        recordId={historyRecord?.id ?? ''}
        recordNameEn={historyRecord?.nameEn ?? ''}
        recordNameAr={historyRecord?.nameAr}
        resourceType="grades"
      />

      {/* Drawers & dialogs */}
      <GradeDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSuccess={handleDrawerSuccess}
        editRow={editRow}
        legalEntities={legalEntities}
      />

      <DisableConfirmDialog
        open={!!disableRow}
        onClose={() => setDisableRow(null)}
        onConfirm={handleConfirmDisable}
        entityName={disableRow ? `${disableRow.gradeCode} — ${disableRow.gradeNameEn}` : ''}
        warningMessage={locale === 'ar' ? 'لن يتأثر الموظفون المعيّنون حاليًا على هذه الدرجة.' : 'Employees currently assigned to this grade are unaffected.'}
        isPending={isPending}
      />

      {/* Toast */}
      {toastMsg && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 100,
          background: 'var(--ink-1)', color: "var(--on-accent)",
          padding: '10px 18px', borderRadius: 8,
          fontSize: 'var(--text-body)', fontWeight: 500,
          boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
          animation: 'fadeIn 200ms ease',
        }}>
          {toastMsg}
        </div>
      )}
    </div>
  )
}
