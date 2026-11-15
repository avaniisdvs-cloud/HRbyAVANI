import { formatAuditTimestamp } from '@/lib/format-date'
import { computeDiff } from '@/lib/audit-diff'
import { HistoryDiffRow } from './HistoryDiffRow'
import type { AuditHistoryEntry } from '@/lib/mdm-audit'

interface HistoryEventCardProps {
  entry:       AuditHistoryEntry
  fieldLabels: Record<string, string>
}

const EVENT_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
  CREATED:  { icon: '🟢', label: 'CREATED',    color: '#2E8B57' },
  UPDATED:  { icon: '✏️', label: 'UPDATED',    color: 'var(--ink-2)' },
  DISABLED: { icon: '🔴', label: 'DISABLED',   color: '#C62828' },
  ENABLED:  { icon: '🟢', label: 'RE-ENABLED', color: '#2E8B57' },
}

function resolveEventConfig(eventType: string) {
  if (eventType.includes('CREATED'))  return EVENT_CONFIG.CREATED
  if (eventType.includes('DISABLED')) return EVENT_CONFIG.DISABLED
  if (eventType.includes('ENABLED'))  return EVENT_CONFIG.ENABLED
  return EVENT_CONFIG.UPDATED
}

export function HistoryEventCard({ entry, fieldLabels }: HistoryEventCardProps) {
  const config      = resolveEventConfig(entry.eventType)
  const reason      = (entry.metadata as Record<string, unknown> | null)?.changeReason as string | undefined
  const isCreated   = entry.eventType.includes('CREATED')
  const isDisabled  = entry.eventType.includes('DISABLED')
  const isEnabled   = entry.eventType.includes('ENABLED')

  const diffs = (!isCreated && !isDisabled && !isEnabled && entry.oldValues && entry.newValues)
    ? computeDiff(entry.oldValues, entry.newValues, fieldLabels)
    : []

  return (
    <div style={{
      border:       '1px solid var(--border)',
      borderRadius: 8,
      background:   'var(--surface)',
      padding:      '12px 14px',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14, flexShrink: 0 }}>{config.icon}</span>
          <span style={{
            fontSize:   'var(--text-caption)',
            fontWeight: 700,
            color:      config.color,
            letterSpacing: '0.05em',
          }}>
            {config.label}
          </span>
        </div>
        <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', whiteSpace: 'nowrap', marginLeft: 8 }}>
          {formatAuditTimestamp(entry.createdDate)}
        </span>
      </div>

      {/* Actor */}
      <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-2)', marginBottom: 8 }}>
        By: <span style={{ fontWeight: 500, color: 'var(--ink-1)' }}>{entry.actorName}</span>
        {entry.actorRole && (
          <span style={{ color: 'var(--ink-3)', marginLeft: 4 }}>({entry.actorRole.replace(/_/g, ' ')})</span>
        )}
      </div>

      {/* Diffs */}
      {diffs.length > 0 && (
        <div style={{
          borderTop:   '1px solid var(--border)',
          paddingTop:  10,
          marginBottom: 8,
        }}>
          {diffs.map(d => (
            <HistoryDiffRow key={d.fieldKey} diff={d} />
          ))}
        </div>
      )}

      {/* Created / Disabled / Enabled label */}
      {isCreated && (
        <div style={{
          borderTop:  '1px solid var(--border)',
          paddingTop: 8,
          fontSize:   'var(--text-caption)',
          color:      'var(--ink-3)',
        }}>
          Record created
        </div>
      )}
      {(isDisabled || isEnabled) && (
        <div style={{
          borderTop:  '1px solid var(--border)',
          paddingTop: 8,
          fontSize:   'var(--text-caption)',
          color:      'var(--ink-3)',
        }}>
          Record {isDisabled ? 'disabled' : 're-enabled'}
        </div>
      )}

      {/* Reason */}
      {reason && (
        <div style={{
          borderTop:   diffs.length > 0 || isCreated || isDisabled || isEnabled ? 'none' : '1px solid var(--border)',
          paddingTop:  diffs.length > 0 || isCreated || isDisabled || isEnabled ? 4 : 8,
          fontSize:    'var(--text-caption)',
          color:       'var(--ink-2)',
          fontStyle:   'italic',
        }}>
          💬 &ldquo;{reason}&rdquo;
        </div>
      )}
    </div>
  )
}
