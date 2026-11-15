'use client'

import { useState } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import type { AuditHistoryEntry } from '@/lib/mdm-audit'
import { AuditTrailRow } from './AuditTrailRow'

interface MdmChangeHistoryProps {
  entries:       AuditHistoryEntry[]
  resourceType:  string
  initialCollapsed?: boolean
}

export function MdmChangeHistory({ entries, initialCollapsed = false }: MdmChangeHistoryProps) {
  const [collapsed, setCollapsed] = useState(initialCollapsed)

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: 10,
      background: 'var(--card)',
      overflow: 'hidden',
      marginTop: 16,
    }}>
      {/* Header */}
      <button
        onClick={() => setCollapsed(c => !c)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          padding: '12px 16px',
          background: 'var(--surface)',
          borderTopWidth: "0px",
          borderTopStyle: "none",
          borderTopColor: "currentColor",
          borderRightWidth: "0px",
          borderRightStyle: "none",
          borderRightColor: "currentColor",
          borderLeftWidth: "0px",
          borderLeftStyle: "none",
          borderLeftColor: "currentColor",
          borderBottomWidth: (collapsed) ? "0px" : "1px",
          borderBottomStyle: (collapsed) ? "none" : "solid",
          borderBottomColor: (collapsed) ? "currentColor" : "var(--border)",
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 'var(--text-caption)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-3)' }}>
          Recent Changes {entries.length > 0 && `(${entries.length})`}
        </span>
        {collapsed ? <ChevronDown size={14} color="var(--ink-4)" /> : <ChevronUp size={14} color="var(--ink-4)" />}
      </button>

      {!collapsed && (
        <div style={{ padding: '0 16px' }}>
          {entries.length === 0 ? (
            <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', textAlign: 'center', padding: '20px 0' }}>
              No changes recorded yet
            </p>
          ) : (
            entries.map(entry => (
              <AuditTrailRow key={entry.id} entry={entry} />
            ))
          )}
        </div>
      )}
    </div>
  )
}
