'use client'

import { X, Monitor } from 'lucide-react'
import { useLocale } from '@/components/providers/LocaleProvider'
import type { SystemUserRow } from '@/lib/org-chart/types'

interface SystemUsersPanelProps {
  users:   SystemUserRow[]
  onClose: () => void
}

function Initials({ name, photo }: { name: string | null; photo: string | null }) {
  if (photo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photo}
        alt=""
        width={32}
        height={32}
        style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      />
    )
  }
  const letters = (name ?? '?').split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase()
  return (
    <div style={{
      width:           32,
      height:          32,
      borderRadius:    '50%',
      background:      'var(--surface)',
      border:          '1.5px solid var(--border)',
      display:         'flex',
      alignItems:      'center',
      justifyContent:  'center',
      fontSize:        'var(--text-caption)',
      fontWeight:      700,
      color:           'var(--ink-2)',
      fontFamily:      'var(--font-sans)',
      flexShrink:      0,
    }}>
      {letters}
    </div>
  )
}

export function SystemUsersPanel({ users, onClose }: SystemUsersPanelProps) {
  const isAr = useLocale() === 'ar'
  return (
    <div style={{
      position:     'fixed',
      bottom:       24,
      right:        24,
      width:        320,
      maxHeight:    420,
      background:   'var(--card)',
      border:       '1px solid var(--border)',
      borderRadius: 12,
      boxShadow:    '0 8px 32px rgba(0,0,0,0.14)',
      zIndex:       80,
      display:      'flex',
      flexDirection:'column',
      overflow:     'hidden',
    }}>
      {/* Header */}
      <div style={{
        display:      'flex',
        alignItems:   'center',
        gap:          8,
        padding:      '12px 14px',
        borderBottom: '1px solid var(--border)',
        flexShrink:   0,
      }}>
        <Monitor size={14} strokeWidth={2} style={{ color: 'var(--ink-3)', flexShrink: 0 }} />
        <span style={{
          flex:       1,
          fontSize:   'var(--text-body)',
          fontWeight: 600,
          color:      'var(--ink-1)',
          fontFamily: 'var(--font-sans)',
        }}>
          {isAr ? 'مستخدمو النظام' : 'System Users'}
        </span>
        <span style={{
          fontSize:     'var(--text-caption)',
          fontWeight:   500,
          color:        'var(--ink-3)',
          fontFamily:   'var(--font-sans)',
          background:   'var(--surface)',
          padding:      '1px 7px',
          borderRadius: 10,
          marginRight:  4,
        }}>
          {users.length}
        </span>
        <button
          onClick={onClose}
          aria-label={isAr ? 'إغلاق لوحة مستخدمي النظام' : 'Close system users panel'}
          style={{
            background: 'none',
            border:     'none',
            cursor:     'pointer',
            padding:    2,
            color:      'var(--ink-3)',
            display:    'flex',
            alignItems: 'center',
          }}
        >
          <X size={14} strokeWidth={2.5} />
        </button>
      </div>

      {/* List */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {users.length === 0 ? (
          <div style={{ padding: '20px 14px', textAlign: 'center', fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontFamily: 'var(--font-sans)' }}>
            {isAr ? 'لا يوجد مستخدمو نظام.' : 'No system users found.'}
          </div>
        ) : users.map((u, idx) => (
          <div
            key={u.id}
            style={{
              display:      'flex',
              alignItems:   'center',
              gap:          10,
              padding:      '9px 14px',
              borderBottom: idx < users.length - 1 ? '1px solid var(--border)' : 'none',
            }}
          >
            <Initials name={u.fullNameEn} photo={u.photoUrl} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{
                fontSize:     'var(--text-caption)',
                fontWeight:   600,
                color:        'var(--ink-1)',
                fontFamily:   'var(--font-sans)',
                overflow:     'hidden',
                textOverflow: 'ellipsis',
                whiteSpace:   'nowrap',
              }}>
                {u.fullNameEn ?? u.personNumber}
              </div>
              <div style={{
                fontSize:     'var(--text-caption)',
                color:        'var(--ink-3)',
                fontFamily:   'var(--font-mono)',
                overflow:     'hidden',
                textOverflow: 'ellipsis',
                whiteSpace:   'nowrap',
                marginTop:    1,
              }}>
                {u.personNumber}
                {u.deptNameEn && (
                  <span style={{ marginLeft: 6, fontFamily: 'var(--font-sans)' }}>· {u.deptNameEn}</span>
                )}
              </div>
            </div>
            {u.employmentType && (
              <span style={{
                fontSize:     'var(--text-caption)',
                fontWeight:   600,
                color:        'var(--ink-3)',
                fontFamily:   'var(--font-sans)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                background:   'var(--surface)',
                padding:      '2px 6px',
                borderRadius: 4,
                flexShrink:   0,
              }}>
                {u.employmentType.replace(/_/g, ' ')}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
