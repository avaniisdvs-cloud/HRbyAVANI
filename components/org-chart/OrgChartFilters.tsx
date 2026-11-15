'use client'

import { useState } from 'react'
import { X }        from 'lucide-react'
import { useLocale } from '@/components/providers/LocaleProvider'

export interface ActiveFilters {
  showActive:          boolean
  showVacant:          boolean
  showContractors:     boolean
  showActing:          boolean
  showFrozen:          boolean
  showOnLeave:         boolean
  showNewJoiners:      boolean
  showEmiratisation:   boolean
  deptIds:             string[]
  flagOverloaded:      boolean
  flagUnderSupervised: boolean
}

export const DEFAULT_FILTERS: ActiveFilters = {
  showActive:          true,
  showVacant:          true,
  showContractors:     false,
  showActing:          true,
  showFrozen:          true,
  showOnLeave:         false,
  showNewJoiners:      false,
  showEmiratisation:   false,
  deptIds:             [],
  flagOverloaded:      false,
  flagUnderSupervised: false,
}

export function countActiveFilters(f: ActiveFilters): number {
  let n = 0
  if (!f.showActive)          n++
  if (!f.showVacant)          n++
  if (!f.showActing)          n++
  if (!f.showFrozen)          n++
  if (f.showContractors)      n++
  if (f.showOnLeave)          n++
  if (f.showNewJoiners)       n++
  if (f.showEmiratisation)    n++
  if (f.deptIds.length > 0)   n++
  if (f.flagOverloaded)       n++
  if (f.flagUnderSupervised)  n++
  return n
}

interface OrgChartFiltersProps {
  filters:     ActiveFilters
  onChange:    (f: ActiveFilters) => void
  onClose:     () => void
  departments: Array<{ id: string; nameEn: string; nameAr: string }>
  viewerRole:  string
}

// ─── Reusable toggle row ──────────────────────────────────────────────────────

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label:    string
  checked:  boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label style={{
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'space-between',
      padding:        '8px 0',
      cursor:         'pointer',
    }}>
      <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-1)', fontFamily: 'var(--font-sans)' }}>
        {label}
      </span>
      <div
        onClick={() => onChange(!checked)}
        style={{
          width:        36,
          height:       20,
          borderRadius: 10,
          background:   checked ? 'var(--accent)' : 'var(--border)',
          position:     'relative',
          cursor:       'pointer',
          flexShrink:   0,
          transition:   'background 0.15s',
        }}
      >
        <div style={{
          position:     'absolute',
          top:          2,
          left:         checked ? 18 : 2,
          width:        16,
          height:       16,
          borderRadius: '50%',
          background:   'white',
          boxShadow:    '0 1px 3px rgba(0,0,0,0.2)',
          transition:   'left 0.15s',
        }} />
      </div>
    </label>
  )
}

// ─── Checkbox row ─────────────────────────────────────────────────────────────

function CheckRow({
  label,
  checked,
  onChange,
}: {
  label:    string
  checked:  boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label style={{
      display:    'flex',
      alignItems: 'center',
      gap:        8,
      padding:    '6px 0',
      cursor:     'pointer',
    }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        style={{ accentColor: 'var(--accent)', width: 14, height: 14, flexShrink: 0 }}
      />
      <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-1)', fontFamily: 'var(--font-sans)' }}>
        {label}
      </span>
    </label>
  )
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHead({ label }: { label: string }) {
  return (
    <div style={{
      fontSize:      'var(--text-caption)',
      fontWeight:    700,
      letterSpacing: '0.07em',
      color:         'var(--ink-3)',
      fontFamily:    'var(--font-sans)',
      padding:       '12px 0 4px',
      borderTop:     '1px solid var(--border)',
      marginTop:     4,
    }}>
      {label}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export function OrgChartFilters({
  filters,
  onChange,
  onClose,
  departments,
  viewerRole,
}: OrgChartFiltersProps) {
  const [deptSearch, setDeptSearch] = useState('')
  const locale = useLocale()
  const isAr   = locale === 'ar'

  const set = <K extends keyof ActiveFilters>(key: K, value: ActiveFilters[K]) =>
    onChange({ ...filters, [key]: value })

  const activeCount = countActiveFilters(filters)
  const isHROrExec  = viewerRole === 'HR_ADMIN' || viewerRole === 'EXECUTIVE'

  const filteredDepts = departments.filter(d =>
    d.nameEn.toLowerCase().includes(deptSearch.toLowerCase()),
  )

  const toggleDept = (id: string) => {
    const next = filters.deptIds.includes(id)
      ? filters.deptIds.filter(d => d !== id)
      : [...filters.deptIds, id]
    set('deptIds', next)
  }

  return (
    <>
      {/* Backdrop — covers canvas left of panel */}
      <div
        onClick={onClose}
        style={{
          position:   'fixed',
          top:        56,
          left:       0,
          right:      280,
          bottom:     0,
          background: 'rgba(0,0,0,0.15)',
          zIndex:     39,
        }}
      />

      {/* Panel */}
      <div style={{
        position:   'fixed',
        top:        56,
        right:      0,
        width:      280,
        height:     'calc(100vh - 56px)',
        background: 'var(--card)',
        borderLeft: '1px solid var(--border)',
        boxShadow:  '-4px 0 20px rgba(0,0,0,0.08)',
        zIndex:     40,
        display:    'flex',
        flexDirection: 'column',
        overflowY:  'hidden',
      }}>
        {/* Header — sticky */}
        <div style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          padding:        '14px 16px 10px',
          borderBottom:   '1px solid var(--border)',
          flexShrink:     0,
        }}>
          <span style={{
            fontSize:   14,
            fontWeight: 600,
            fontFamily: 'var(--font-serif)',
            color:      'var(--ink-1)',
          }}>
            {isAr ? 'عوامل التصفية' : 'Filters'}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {activeCount > 0 && (
              <button
                onClick={() => onChange(DEFAULT_FILTERS)}
                style={{
                  background: 'none',
                  border:     'none',
                  cursor:     'pointer',
                  fontSize:   'var(--text-caption)',
                  color:      'var(--brand-active)',
                  fontFamily: 'var(--font-sans)',
                  padding:    0,
                }}
              >
                {isAr ? 'مسح الكل' : 'Clear all'}
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border:     'none',
                cursor:     'pointer',
                color:      'var(--ink-3)',
                display:    'flex',
                alignItems: 'center',
                padding:    0,
              }}
              aria-label={isAr ? 'إغلاق عوامل التصفية' : 'Close filters'}
            >
              <X size={16} strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px' }}>

          {/* Show / Hide Nodes */}
          <SectionHead label={isAr ? 'إظهار / إخفاء العُقد' : 'SHOW / HIDE NODES'} />
          <ToggleRow label={isAr ? 'الموظفون النشطون'   : 'Active employees'}   checked={filters.showActive}  onChange={v => set('showActive',  v)} />
          <ToggleRow label={isAr ? 'الوظائف الشاغرة'     : 'Vacant positions'}   checked={filters.showVacant}  onChange={v => set('showVacant',  v)} />
          <ToggleRow label={isAr ? 'التكليفات بالإنابة'  : 'Acting assignments'} checked={filters.showActing}  onChange={v => set('showActing',  v)} />
          <ToggleRow label={isAr ? 'الوظائف المجمَّدة'   : 'Frozen positions'}   checked={filters.showFrozen}  onChange={v => set('showFrozen',  v)} />

          {/* Employee Flags */}
          <SectionHead label={isAr ? 'مؤشرات الموظفين' : 'EMPLOYEE FLAGS'} />
          <CheckRow label={isAr ? 'المتعاقدون فقط'             : 'Contractors only'}      checked={filters.showContractors}   onChange={v => set('showContractors',   v)} />
          <CheckRow label={isAr ? 'في إجازة'                  : 'On leave'}              checked={filters.showOnLeave}       onChange={v => set('showOnLeave',       v)} />
          <CheckRow label={isAr ? 'الملتحقون الجدد (٩٠ يومًا)' : 'New joiners (90 days)'}  checked={filters.showNewJoiners}    onChange={v => set('showNewJoiners',    v)} />
          <CheckRow label={isAr ? 'وظائف التوطين'             : 'Emiratisation roles'}   checked={filters.showEmiratisation} onChange={v => set('showEmiratisation', v)} />

          {/* Department filter */}
          {departments.length > 1 && (
            <>
              <SectionHead label={isAr ? 'القسم' : 'DEPARTMENT'} />
              <input
                value={deptSearch}
                onChange={e => setDeptSearch(e.target.value)}
                placeholder={isAr ? 'البحث في الأقسام…' : 'Search departments…'}
                style={{
                  width:        '100%',
                  height:       30,
                  borderRadius: 6,
                  border:       '1px solid var(--border)',
                  background:   'var(--bg)',
                  padding:      '0 8px',
                  fontSize:     'var(--text-caption)',
                  fontFamily:   'var(--font-sans)',
                  color:        'var(--ink-1)',
                  outline:      'none',
                  marginBottom: 4,
                  boxSizing:    'border-box',
                }}
              />
              <div style={{ display: 'flex', gap: 12, marginBottom: 4 }}>
                <button
                  onClick={() => set('deptIds', departments.map(d => d.id))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 'var(--text-caption)', color: 'var(--brand-active)', fontFamily: 'var(--font-sans)', padding: 0 }}
                >
                  {isAr ? 'تحديد الكل' : 'Select all'}
                </button>
                <button
                  onClick={() => set('deptIds', [])}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontFamily: 'var(--font-sans)', padding: 0 }}
                >
                  {isAr ? 'مسح' : 'Clear'}
                </button>
              </div>
              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                {filteredDepts.map(dept => (
                  <CheckRow
                    key={dept.id}
                    label={dept.nameEn}
                    checked={filters.deptIds.includes(dept.id)}
                    onChange={() => toggleDept(dept.id)}
                  />
                ))}
              </div>
            </>
          )}

          {/* Span of Control — HR/EXECUTIVE only */}
          {isHROrExec && (
            <>
              <SectionHead label={isAr ? 'نطاق الإشراف' : 'SPAN OF CONTROL'} />
              <ToggleRow
                label={isAr ? 'تمييز الزائد عن الحد (أكثر من ٨ مرؤوسين)' : 'Flag overloaded (> 8 reports)'}
                checked={filters.flagOverloaded}
                onChange={v => set('flagOverloaded', v)}
              />
              <ToggleRow
                label={isAr ? 'تمييز قليل الإشراف (لا مرؤوسين)' : 'Flag under-supervised (0 reports)'}
                checked={filters.flagUnderSupervised}
                onChange={v => set('flagUnderSupervised', v)}
              />
            </>
          )}

          <div style={{ height: 16 }} />
        </div>

        {/* Footer — sticky */}
        <div style={{
          padding:     '10px 16px',
          borderTop:   '1px solid var(--border)',
          flexShrink:  0,
        }}>
          <div style={{
            fontSize:     'var(--text-caption)',
            color:        'var(--ink-3)',
            fontFamily:   'var(--font-sans)',
            marginBottom: 8,
          }}>
            {activeCount === 0
              ? (isAr ? 'لا توجد عوامل تصفية مفعّلة' : 'No filters active')
              : (isAr
                  ? `${activeCount} عامل تصفية مفعّل`
                  : `${activeCount} filter${activeCount > 1 ? 's' : ''} active`)}
          </div>
          <button
            onClick={onClose}
            style={{
              width:        '100%',
              height:       36,
              borderRadius: 6,
              background:   'var(--accent)',
              color:        'white',
              border:       'none',
              fontSize:     'var(--text-body)',
              fontWeight:   600,
              fontFamily:   'var(--font-sans)',
              cursor:       'pointer',
            }}
          >
            {isAr ? 'تطبيق وإغلاق' : 'Apply & Close'}
          </button>
        </div>
      </div>
    </>
  )
}
