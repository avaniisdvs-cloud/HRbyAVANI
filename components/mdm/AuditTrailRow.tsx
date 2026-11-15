import { formatAuditTimestamp } from '@/lib/format-date'
import type { AuditHistoryEntry } from '@/lib/mdm-audit'

const FIELD_LABEL_FALLBACK: Record<string, string> = {
  nameEn: 'Name (EN)', nameAr: 'Name (AR)', businessUnitId: 'Business Unit',
  departmentType: 'Department Type', legalEntityId: 'Legal Entity',
  positionTitleEn: 'Title (EN)', gradeId: 'Grade', locationId: 'Location',
  fteCount: 'FTE', reportsToPositionId: 'Reports To',
  gradeNameEn: 'Name (EN)', gradeLevel: 'Grade Level',
  minSalary: 'Min Salary', maxSalary: 'Max Salary',
  timezone: 'Timezone', phone: 'Phone', emirate: 'Emirate',
  scheduleName: 'Schedule Name', totalWeeklyHours: 'Weekly Hours',
  typeNameEn: 'Name (EN)', isPaid: 'Pay Type', maxDaysPerYear: 'Max Days',
  jobTitleEn: 'Job Title', jobFamily: 'Job Family',
}

function humanLabel(key: string): string {
  return FIELD_LABEL_FALLBACK[key] ?? key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, s => s.toUpperCase())
    .trim()
}

function eventIcon(eventType: string) {
  if (eventType.includes('CREATED'))  return { icon: '🟢', label: 'Created' }
  if (eventType.includes('DISABLED')) return { icon: '🔴', label: 'Disabled' }
  if (eventType.includes('ENABLED'))  return { icon: '🟢', label: 'Enabled' }
  return { icon: '✏️', label: 'Updated' }
}

interface AuditTrailRowProps {
  entry:          AuditHistoryEntry
  resourceLabel?: string
}

export function AuditTrailRow({ entry, resourceLabel }: AuditTrailRowProps) {
  const { icon, label } = eventIcon(entry.eventType)
  const reason      = (entry.metadata as Record<string, unknown> | null)?.changeReason as string | undefined
  const resourceName = (entry.metadata as Record<string, unknown> | null)?.resourceName as string | undefined

  const SKIP_FIELDS = new Set(['createdBy','createdByName','updatedBy','updatedByName',
    'lastUpdatedDate','updatedDate','tenantId','isActive'])

  const changedFields = entry.oldValues && entry.newValues
    ? Object.keys(entry.newValues).filter(k =>
        !SKIP_FIELDS.has(k) &&
        JSON.stringify(entry.oldValues?.[k]) !== JSON.stringify(entry.newValues?.[k])
      )
    : []

  const displayName = resourceName ?? resourceLabel

  return (
    <div style={{
      display:      'flex',
      gap:          10,
      padding:      '10px 0',
      borderBottom: '1px solid var(--border)',
    }}>
      <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{icon}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-2)', fontWeight: 500 }}>
          {label} by {entry.actorName}
        </div>
        {displayName && (
          <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-1)', fontWeight: 500, marginTop: 1 }}>
            {displayName}
          </div>
        )}
        {changedFields.length > 0 && (
          <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', marginTop: 2 }}>
            {changedFields.slice(0, 3).map(humanLabel).join(', ')}
            {changedFields.length > 3 ? ` +${changedFields.length - 3} more` : ''}
            {' changed'}
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 3 }}>
          <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)' }}>
            {formatAuditTimestamp(entry.createdDate)}
          </span>
          {reason && (
            <>
              <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)' }}>·</span>
              <span style={{
                fontSize:     'var(--text-caption)',
                color:        'var(--ink-3)',
                fontStyle:    'italic',
                overflow:     'hidden',
                textOverflow: 'ellipsis',
                whiteSpace:   'nowrap',
                maxWidth:     160,
              }}>
                &ldquo;{reason}&rdquo;
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
