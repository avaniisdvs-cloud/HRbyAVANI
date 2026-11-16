'use client'

import { useEffect, useState } from 'react'
import { X, Clock } from 'lucide-react'
import { getRecordHistory } from '@/lib/mdm-audit'
import { formatAuditTimestamp } from '@/lib/format-date'
import { HistoryEventCard } from './HistoryEventCard'
import type { AuditHistoryEntry } from '@/lib/mdm-audit'

import { DEPARTMENT_FIELD_LABELS }     from './fieldLabels/departments'
import { LEGAL_ENTITY_FIELD_LABELS }   from './fieldLabels/legalEntities'
import { POSITION_FIELD_LABELS }       from './fieldLabels/positions'
import { GRADE_FIELD_LABELS }          from './fieldLabels/grades'
import { LOCATION_FIELD_LABELS }       from './fieldLabels/locations'
import { WORK_SCHEDULE_FIELD_LABELS }  from './fieldLabels/workSchedules'
import { HOLIDAY_CALENDAR_FIELD_LABELS } from './fieldLabels/holidayCalendars'
import { LEAVE_TYPE_FIELD_LABELS }     from './fieldLabels/leaveTypes'
import { JOB_FIELD_LABELS }            from './fieldLabels/jobs'
import { USER_ACCOUNT_FIELD_LABELS }   from './fieldLabels/userAccounts'

const FIELD_LABEL_MAP: Record<string, Record<string, string>> = {
  departments:       DEPARTMENT_FIELD_LABELS,
  legal_entities:    LEGAL_ENTITY_FIELD_LABELS,
  positions:         POSITION_FIELD_LABELS,
  grades:            GRADE_FIELD_LABELS,
  locations:         LOCATION_FIELD_LABELS,
  work_schedules:    WORK_SCHEDULE_FIELD_LABELS,
  public_holidays:   HOLIDAY_CALENDAR_FIELD_LABELS,
  absence_types:     LEAVE_TYPE_FIELD_LABELS,
  jobs:              JOB_FIELD_LABELS,
  user_accounts:     USER_ACCOUNT_FIELD_LABELS,
}

export interface RecordHistoryDrawerProps {
  isOpen:        boolean
  onClose:       () => void
  recordId:      string
  recordNameEn:  string
  recordNameAr?: string
  resourceType:  string
}

function LoadingSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {[1, 2, 3].map(i => (
        <div key={i} style={{
          height:       80,
          borderRadius: 8,
          background:   'var(--border)',
          opacity:      0.5,
          animation:    'pulse 1.5s ease-in-out infinite',
        }} />
      ))}
    </div>
  )
}

export function RecordHistoryDrawer({
  isOpen,
  onClose,
  recordId,
  recordNameEn,
  recordNameAr,
  resourceType,
}: RecordHistoryDrawerProps) {
  const [entries, setEntries] = useState<AuditHistoryEntry[]>([])
  const [loading, setLoading] = useState(false)

  const fieldLabels = FIELD_LABEL_MAP[resourceType] ?? {}

  useEffect(() => {
    if (!isOpen || !recordId) {
      setEntries([])
      return
    }
    setLoading(true)
    setEntries([])
    getRecordHistory(resourceType, recordId).then(data => {
      setEntries(data)
      setLoading(false)
    })
  }, [isOpen, recordId, resourceType])

  useEffect(() => {
    if (!isOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const createdEntry = entries[entries.length - 1]
  const isCreateEvent = createdEntry?.eventType.includes('CREATED')

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position:   'fixed',
          inset:      0,
          background: 'rgba(0,0,0,0.4)',
          zIndex:     40,
        }}
      />

      {/* Drawer */}
      <div style={{
        position:    'fixed',
        right:       0,
        top:         0,
        height:      '100%',
        width:       400,
        zIndex:      50,
        display:     'flex',
        flexDirection: 'column',
        background:  'var(--card)',
        borderLeft:  '1px solid var(--border)',
        boxShadow:   '-4px 0 24px rgba(0,0,0,0.08)',
      }}>

        {/* Header */}
        <div style={{
          padding:      '16px 20px',
          borderBottom: '1px solid var(--border)',
          flexShrink:   0,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                <Clock size={15} color="var(--accent)" />
                <span style={{
                  fontSize:   'var(--text-body)',
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 600,
                  color:      'var(--ink-1)',
                }}>
                  Change History
                </span>
              </div>
              <div style={{ fontSize: 'var(--text-body)', fontWeight: 500, color: 'var(--ink-1)' }}>
                {recordNameEn}
              </div>
              {recordNameAr && (
                <div dir="rtl" style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', marginTop: 2 }}>
                  {recordNameAr}
                </div>
              )}
              {isCreateEvent && (
                <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', marginTop: 4 }}>
                  Created {formatAuditTimestamp(createdEntry.createdDate)} by {createdEntry.actorName}
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              style={{
                background:  'none',
                border:      'none',
                cursor:      'pointer',
                color:       'var(--ink-3)',
                padding:     4,
                borderRadius: 4,
                flexShrink:  0,
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{
          flex:       1,
          overflowY:  'auto',
          padding:    '16px',
          display:    'flex',
          flexDirection: 'column',
          gap:        10,
        }}>
          {loading && <LoadingSkeleton />}

          {!loading && entries.length === 0 && (
            <div style={{
              textAlign:  'center',
              marginTop:  48,
              color:      'var(--ink-3)',
              fontSize:   'var(--text-body)',
            }}>
              No changes recorded yet
            </div>
          )}

          {!loading && entries.map(entry => (
            <HistoryEventCard
              key={entry.id}
              entry={entry}
              fieldLabels={fieldLabels}
            />
          ))}
        </div>

        {/* Footer */}
        <div style={{
          padding:    '12px 20px',
          borderTop:  '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)', textAlign: 'center' }}>
            {loading ? 'Loading…' : `Showing ${entries.length} change${entries.length !== 1 ? 's' : ''}`}
          </div>
        </div>
      </div>
    </>
  )
}
