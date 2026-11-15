'use client'

import { TableScrollRegion } from '@/components/ui/TableScrollRegion'
import { useState, useEffect } from 'react'
import { ScrollText, Lock } from 'lucide-react'
import { useLocale } from '@/components/providers/LocaleProvider'
import { getAuditLogEntries } from '@/modules/aria'
import type { AuditEntry } from '@/modules/aria'
import type { AriaSessionContext } from '@/modules/aria'

interface Props {
  sessionCtx: AriaSessionContext
  onAskAria:  (prompt: string) => void
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-AE', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

const CHANNEL_COLORS: Record<string, string> = {
  WEB:        'var(--status-approved-fg)',
  ARIA_TEXT:  'var(--accent)',
  ARIA_VOICE: 'var(--accent)',
  API:        'var(--status-pending-fg)',
  SYSTEM:     'var(--ink-3)',
  BATCH:      'var(--ink-3)',
}

export default function AriaAuditLogView({ sessionCtx, onAskAria }: Props) {
  const locale = useLocale()
  const { role } = sessionCtx
  const canAccess = role === 'SUPER_ADMIN' || role === 'HR_DIRECTOR'

  const [rows, setRows]        = useState<AuditEntry[]>([])
  const [hasMore, setHasMore]  = useState(false)
  const [page, setPage]        = useState(0)
  const [loading, setLoading]  = useState(false)
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 7)
    return d.toISOString().slice(0, 10)
  })
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10))

  const loadRows = (pg: number) => {
    setLoading(true)
    ;(async () => {
      try {
        const res = await getAuditLogEntries(fromDate, toDate, undefined, undefined, pg)
        if (pg === 0) {
          setRows(res.rows)
        } else {
          setRows(prev => [...prev, ...res.rows])
        }
        setHasMore(res.hasMore)
        setPage(pg)
      } catch (e) {
        console.error('[AuditLog]', e)
      } finally {
        setLoading(false)
      }
    })()
  }

  useEffect(() => {
    if (canAccess) loadRows(0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAccess])

  if (!canAccess) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, background: 'var(--bg)' }}>
        <Lock size={40} style={{ color: 'var(--ink-4)' }} />
        <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink-2)', margin: 0 }}>{locale === 'ar' ? 'الوصول مقيَّد' : 'Access Restricted'}</p>
        <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', margin: 0 }}>{locale === 'ar' ? 'سجل التدقيق متاح فقط لمدير الموارد البشرية والمسؤول الأعلى' : 'Audit Log is only available to HR Director and Super Admin'}</p>
      </div>
    )
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 24, background: 'var(--bg)', boxSizing: 'border-box' }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--ink-1)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <ScrollText size={20} /> {locale === 'ar' ? 'سجل التدقيق' : 'Audit Log'}
        </h2>
        <p style={{ margin: '4px 0 0', fontSize: 'var(--text-body)', color: 'var(--ink-3)' }}>
          {locale === 'ar' ? `${rows.length} إدخالاً · وصول مقيَّد` : `${rows.length} entries · Restricted access`}
        </p>
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>{locale === 'ar' ? 'من' : 'From'}</label>
          <input
            type="date"
            value={fromDate}
            onChange={e => setFromDate(e.target.value)}
            style={{ fontSize: 'var(--text-caption)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', background: 'var(--card)', color: 'var(--ink-1)' }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>{locale === 'ar' ? 'إلى' : 'To'}</label>
          <input
            type="date"
            value={toDate}
            onChange={e => setToDate(e.target.value)}
            style={{ fontSize: 'var(--text-caption)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', background: 'var(--card)', color: 'var(--ink-1)' }}
          />
        </div>
        <button
          onClick={() => loadRows(0)}
          style={{
            padding: '5px 14px', borderRadius: 7, cursor: 'pointer', fontSize: 'var(--text-caption)', fontWeight: 600,
            background: 'var(--accent)', color: 'white', border: 'none',
          }}
        >
          {locale === 'ar' ? 'تطبيق' : 'Apply'}
        </button>
      </div>

      {loading && rows.length === 0 && <div style={{ color: 'var(--ink-3)', fontSize: 'var(--text-body)' }}>{locale === 'ar' ? 'جارٍ تحميل سجل التدقيق…' : 'Loading audit log…'}</div>}

      {rows.length > 0 && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <TableScrollRegion><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-caption)' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {[
                  { en: 'Timestamp',   ar: 'الطابع الزمني' },
                  { en: 'Actor',       ar: 'المُنفِّذ' },
                  { en: 'Channel',     ar: 'القناة' },
                  { en: 'Event',       ar: 'الحدث' },
                  { en: 'Resource',    ar: 'المورد' },
                  { en: 'Description', ar: 'الوصف' },
                ].map(h => (
                  <th key={h.en} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 'var(--text-caption)', fontWeight: 700, color: 'var(--ink-3)', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {locale === 'ar' ? h.ar : h.en}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={row.id}
                  style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface)' }}
                >
                  <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', color: 'var(--ink-3)' }}>
                    {formatDateTime(row.eventTime)}
                  </td>
                  <td style={{ padding: '8px 12px', color: 'var(--ink-1)', fontWeight: 500 }}>
                    <div>{row.actorName}</div>
                    <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)' }}>{row.actorRole}</div>
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: CHANNEL_COLORS[row.channel] ?? 'var(--ink-3)' }}>
                      {row.channel}
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px', color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>{row.eventType}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--ink-3)' }}>{row.resourceType}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--ink-3)', maxWidth: 240 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.description ?? '—'}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></TableScrollRegion>
        </div>
      )}

      {hasMore && (
        <button
          onClick={() => loadRows(page + 1)}
          disabled={loading}
          style={{
            marginTop: 14, padding: '8px 18px', borderRadius: 8, cursor: 'pointer', fontSize: 'var(--text-body)', fontWeight: 600,
            background: 'var(--card)', color: 'var(--brand-active)', border: '1px solid var(--accent)',
          }}
        >
          {loading ? (locale === 'ar' ? 'جارٍ التحميل…' : 'Loading…') : (locale === 'ar' ? 'تحميل المزيد' : 'Load more')}
        </button>
      )}
    </div>
  )
}
