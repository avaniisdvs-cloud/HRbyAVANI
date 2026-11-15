'use client'

/**
 * components/org-chart/OrgChartStatsBar.tsx
 *
 * Engine-aware stats bar rendered below the topbar.
 * Accepts the new HierarchyMeta (Session 3) with backward compat for
 * the legacy OrgTreeMeta shape passed from page.tsx on initial SSR load.
 *
 * Position engine:  Total · Occupied · Vacant · Acting · Frozen
 * Reporting engine: Total employees · Managers · Individual contributors · Avg span · Max depth
 * Department engine: Departments · With vacancies · Max depth
 * My Team engine:   Team size · Direct reports · Managers · Max depth
 */

import type { OrgTreeMeta, OrgViewerRole } from '@/lib/org-chart/types'
import type { HierarchyMeta }              from '@/lib/org-chart/engines/engine-types'

// Accept both the legacy OrgTreeMeta (from page.tsx SSR) and the new HierarchyMeta
type MetaProp = OrgTreeMeta | HierarchyMeta

function isHierarchyMeta(m: MetaProp): m is HierarchyMeta {
  return 'engine' in m
}

interface OrgChartStatsBarProps {
  meta:       MetaProp
  viewerRole: OrgViewerRole
}

const sep = (
  <span style={{ color: 'var(--ink-4)', margin: '0 10px' }}>·</span>
)

export function OrgChartStatsBar({ meta, viewerRole }: OrgChartStatsBarProps) {
  if (viewerRole === 'EMPLOYEE') return null

  const num = (value: number | undefined, color?: string) => (
    <span style={{
      fontSize:   'var(--text-body)',
      fontWeight: 600,
      color:      color ?? 'var(--ink-1)',
      fontFamily: 'var(--font-sans)',
    }}>
      {value ?? '—'}
    </span>
  )

  const label = (text: string) => (
    <span style={{
      fontSize:   'var(--text-caption)',
      color:      'var(--ink-2)',
      fontFamily: 'var(--font-sans)',
    }}>
      {text}
    </span>
  )

  const containerStyle: React.CSSProperties = {
    height:       40,
    minHeight:    40,
    display:      'flex',
    alignItems:   'center',
    padding:      '0 16px',
    background:   'var(--surface)',
    borderBottom: '1px solid var(--border)',
    gap:          0,
    flexShrink:   0,
  }

  // ── My Team engine stats ───────────────────────────────────────────────────
  if (isHierarchyMeta(meta) && meta.engine === 'my-team') {
    return (
      <div style={containerStyle}>
        {label('Team size')}       {num(meta.totalNodes)}
        {sep}
        {label('Direct reports')}  {num(meta.directReports)}
        {sep}
        {label('Managers')}        {num(meta.managersCount)}
        {sep}
        {label('Max depth')}       {num(meta.maxDepth)}
      </div>
    )
  }

  // ── Department engine stats ────────────────────────────────────────────────
  if (isHierarchyMeta(meta) && meta.engine === 'department') {
    return (
      <div style={containerStyle}>
        {label('Departments')}    {num(meta.totalDepts ?? meta.totalNodes)}
        {sep}
        {label('With vacancies')} {num(meta.deptsWithVacancies, (meta.deptsWithVacancies ?? 0) > 0 ? 'var(--org-vacant)' : undefined)}
        {sep}
        {label('Max depth')}      {num(meta.maxDepth)}
      </div>
    )
  }

  // ── Reporting engine stats ─────────────────────────────────────────────────
  if (isHierarchyMeta(meta) && meta.engine === 'reporting') {
    const avgSpan = meta.avgSpanOfControl?.toFixed(1) ?? '—'
    return (
      <div style={containerStyle}>
        {label('Employees')}    {num(meta.totalNodes)}
        {sep}
        {label('Managers')}     {num(meta.managersCount)}
        {sep}
        {label('Individual contributors')} {num(meta.leafEmployees)}
        {sep}
        {label('Avg span')}     <span style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)', fontFamily: 'var(--font-sans)' }}>{avgSpan}</span>
        {sep}
        {label('Max depth')}    {num(meta.maxDepth)}
      </div>
    )
  }

  // ── Position engine stats (default / legacy) ───────────────────────────────
  const totalPositions = isHierarchyMeta(meta) ? (meta.totalPositions ?? meta.totalNodes) : meta.totalPositions
  const occupiedCount  = isHierarchyMeta(meta) ? meta.occupiedCount  : meta.occupiedCount
  const vacantCount    = isHierarchyMeta(meta) ? meta.vacantCount    : meta.vacantCount
  const actingCount    = isHierarchyMeta(meta) ? meta.actingCount    : meta.actingCount
  const frozenCount    = isHierarchyMeta(meta) ? meta.frozenCount    : meta.frozenCount

  return (
    <div style={containerStyle}>
      {label('Total')}    {num(totalPositions)}
      {sep}
      {label('Occupied')} {num(occupiedCount)}
      {sep}
      {label('Vacant')}   {num(vacantCount,  (vacantCount ?? 0) > 0 ? 'var(--org-vacant)' : undefined)}
      {sep}
      {label('Acting')}   {num(actingCount)}
      {sep}
      {label('Frozen')}   {num(frozenCount,  (frozenCount ?? 0) > 0 ? 'var(--org-frozen)' : undefined)}
    </div>
  )
}
