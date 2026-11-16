'use client'

import { SectionTitle } from '@/components/ui/typography'
import { useState, useEffect, useCallback } from 'react'
import { Bell, FileText, CreditCard, Briefcase, RefreshCw, ChevronRight } from 'lucide-react'
import { getExpiryAlerts } from '@/modules/aria'
import type { AlertItem } from '@/modules/aria'
import { useLocale } from '@/components/providers/LocaleProvider'
import { tk } from '@/lib/i18n-messages'
import type { Locale } from '@/lib/i18n'

interface Props {
  onAskAria: (prompt: string) => void
}

type FilterTab = 'all' | 'critical' | 'warning' | 'info'

const SEVERITY_CONFIG = {
  critical: {
    label:   'Critical',
    labelAr: 'حرج',
    bg:      'var(--status-rejected-bg)',
    fg:      'var(--status-rejected-fg)',
    barColor:'var(--status-rejected-fg)',
  },
  warning: {
    label:   'Warning',
    labelAr: 'تحذير',
    bg:      'var(--status-warning-bg)',
    fg:      'var(--status-warning-fg)',
    barColor:'var(--status-warning-fg)',
  },
  info: {
    label:   'Info',
    labelAr: 'معلومة',
    bg:      'var(--status-approved-bg)',
    fg:      'var(--status-approved-fg)',
    barColor:'var(--status-approved-fg)',
  },
} as const

function AlertIcon({ type }: { type: AlertItem['type'] }) {
  switch (type) {
    case 'passport':    return <FileText size={16} />
    case 'visa':        return <FileText size={16} />
    case 'emirates_id': return <CreditCard size={16} />
    case 'contract':    return <Briefcase size={16} />
  }
}

function SeverityBadge({ severity, locale }: { severity: AlertItem['severity']; locale: Locale }) {
  const cfg = SEVERITY_CONFIG[severity]
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '2px 8px',
      borderRadius: 999,
      fontSize: 'var(--text-caption)',
      fontWeight: 700,
      background: cfg.bg,
      color: cfg.fg,
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
    }}>
      {locale === 'ar' ? cfg.labelAr : cfg.label}
    </span>
  )
}

function formatDate(s: string) {
  return new Date(s).toLocaleDateString('en-AE', { day: '2-digit', month: 'short', year: 'numeric' })
}

function typeLabel(t: AlertItem['type'], locale: Locale): string {
  switch (t) {
    case 'passport':    return locale === 'ar' ? 'جواز السفر'       : 'Passport'
    case 'visa':        return locale === 'ar' ? 'التأشيرة'         : 'Visa'
    case 'emirates_id': return locale === 'ar' ? 'الهوية الإماراتية' : 'Emirates ID'
    case 'contract':    return locale === 'ar' ? 'العقد'            : 'Contract'
  }
}

function askAriaPrompt(alert: AlertItem): string {
  return (
    `${alert.employeeName}'s ${typeLabel(alert.type, 'en').toLowerCase()} expires on ` +
    `${formatDate(alert.expiryDate)} (${alert.daysLeft} day${alert.daysLeft !== 1 ? 's' : ''} remaining). ` +
    `What HR steps are required to renew or resolve this?`
  )
}

export default function AriaAlertsView({ onAskAria }: Props) {
  const locale = useLocale()
  const [alerts, setAlerts]         = useState<AlertItem[]>([])
  const [activeTab, setActiveTab]   = useState<FilterTab>('all')
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    ;(async () => {
      try {
        const data = await getExpiryAlerts()
        setAlerts(data)
      } catch (e) {
        console.error('[Alerts]', e)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  useEffect(() => { load() }, [load])

  const counts = {
    all:      alerts.length,
    critical: alerts.filter(a => a.severity === 'critical').length,
    warning:  alerts.filter(a => a.severity === 'warning').length,
    info:     alerts.filter(a => a.severity === 'info').length,
  }

  const visible = activeTab === 'all'
    ? alerts
    : alerts.filter(a => a.severity === activeTab)

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all',      label: locale === 'ar' ? 'الكل' : 'All' },
    { key: 'critical', label: locale === 'ar' ? 'حرج' : 'Critical' },
    { key: 'warning',  label: locale === 'ar' ? 'تحذير' : 'Warning' },
    { key: 'info',     label: locale === 'ar' ? 'معلومة' : 'Info' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ flexShrink: 0, padding: '20px 24px 0', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 14 }}>
          <div>
            <SectionTitle style={{
              fontFamily: 'var(--font-serif)',
              fontSize: '20px',
              fontWeight: 600,
              color: 'var(--ink-1)',
              margin: '0 0 2px',
            }}>
              {locale === 'ar' ? 'التنبيهات والمواعيد' : 'Alerts & Deadlines'}
            </SectionTitle>
            <p style={{ fontSize: '12px', color: 'var(--ink-3)', margin: 0 }}>
              {loading
                ? tk(locale, 'common.loading')
                : alerts.length === 0
                  ? (locale === 'ar' ? 'لا توجد تنبيهات نشطة خلال التسعين يوماً القادمة' : 'No active alerts in the next 90 days')
                  : locale === 'ar'
                    ? `${alerts.length} ${alerts.length === 1 ? 'تنبيه' : 'تنبيهات'} · انتهاء المستندات والعقود`
                    : `${alerts.length} alert${alerts.length !== 1 ? 's' : ''} · document and contract expiries`
              }
            </p>
          </div>

          {/* Refresh button */}
          <button
            onClick={load}
            disabled={loading}
            title={locale === 'ar' ? 'تحديث التنبيهات' : 'Refresh alerts'}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontSize: 'var(--text-caption)', fontWeight: 500,
              color: 'var(--ink-2)',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.5 : 1,
              fontFamily: 'var(--font-sans)',
            }}
          >
            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            {locale === 'ar' ? 'تحديث' : 'Refresh'}
          </button>
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 2 }}>
          {tabs.map(tab => {
            const isActive = activeTab === tab.key
            const count    = counts[tab.key]
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px',
                  borderTopWidth: "0px",
                  borderTopStyle: "none",
                  borderTopColor: "currentColor",
                  borderRightWidth: "0px",
                  borderRightStyle: "none",
                  borderRightColor: "currentColor",
                  borderLeftWidth: "0px",
                  borderLeftStyle: "none",
                  borderLeftColor: "currentColor",
                  borderBottomWidth: "2px",
                  borderBottomStyle: "solid",
                  borderBottomColor: (isActive) ? "var(--accent)" : "transparent",
                  background: 'transparent',
                  cursor: 'pointer',
                  fontSize: 'var(--text-body)',
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? 'var(--brand-active)' : 'var(--ink-3)',
                  fontFamily: 'var(--font-sans)',
                  transition: 'color 0.15s ease',
                  marginBottom: -1,
                }}
              >
                {tab.label}
                {count > 0 && (
                  <span style={{
                    padding: '1px 6px',
                    borderRadius: 999,
                    fontSize: 'var(--text-caption)',
                    fontWeight: 700,
                    background: isActive ? 'var(--accent)' : 'var(--surface)',
                    color: isActive ? 'white' : 'var(--ink-3)',
                    border: isActive ? 'none' : '1px solid var(--border)',
                    minWidth: 18,
                    textAlign: 'center',
                  }}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Alert list — scrollable */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>

        {/* Loading skeleton */}
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{
                height: 68, borderRadius: 10,
                background: 'var(--surface)', border: '1px solid var(--border)',
                opacity: 0.6,
              }} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && visible.length === 0 && (
          <div style={{
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            paddingTop: 60, gap: 12, textAlign: 'center',
          }}>
            <Bell size={36} style={{ color: 'var(--ink-4)' }} />
            <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-3)', margin: 0 }}>
              {locale === 'ar'
                ? (activeTab === 'all' ? 'لا توجد تنبيهات انتهاء خلال التسعين يوماً القادمة' : 'لا توجد تنبيهات مطابقة')
                : (activeTab === 'all' ? 'No expiry alerts in the next 90 days' : `No ${activeTab} alerts`)
              }
            </p>
          </div>
        )}

        {/* Alert cards */}
        {!loading && visible.map(alert => {
          const cfg = SEVERITY_CONFIG[alert.severity]
          return (
            <div
              key={alert.id}
              style={{
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                marginBottom: 8,
                display: 'flex',
                overflow: 'hidden',
              }}
            >
              {/* Severity bar */}
              <div style={{ width: 4, background: cfg.barColor, flexShrink: 0 }} />

              {/* Content */}
              <div style={{ padding: '12px 14px', flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8,
                marginBottom: 5 }}>
                  <span style={{ color: cfg.barColor, flexShrink: 0 }}>
                    <AlertIcon type={alert.type} />
                  </span>
                  <span style={{
                    fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--ink-1)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {alert.employeeName}
                  </span>
                  <SeverityBadge severity={alert.severity} locale={locale} />
                </div>
                <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', lineHeight: 1.4 }}>
                  {locale === 'ar'
                    ? `${typeLabel(alert.type, locale)} تنتهي في ${formatDate(alert.expiryDate)}`
                    : `${typeLabel(alert.type, locale)} expires ${formatDate(alert.expiryDate)}`}
                  {' · '}
                  <span style={{ color: cfg.fg, fontWeight: 600 }}>
                    {locale === 'ar'
                      ? `${alert.daysLeft} ${alert.daysLeft === 1 ? 'يوم متبقٍ' : 'يوماً متبقياً'}`
                      : `${alert.daysLeft} day${alert.daysLeft !== 1 ? 's' : ''} remaining`}
                  </span>
                </div>
              </div>

              {/* Ask ARIA button */}
              <div style={{
                padding: '0 14px',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
              }}>
                <button
                  onClick={() => onAskAria(askAriaPrompt(alert))}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '6px 12px',
                    borderRadius: 7, cursor: 'pointer', fontSize: 'var(--text-caption)',
                    background: 'var(--surface)',
                    color: 'var(--brand-active)',
                    border: '1px solid var(--border)',
                    fontWeight: 500, whiteSpace: 'nowrap',
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  {locale === 'ar' ? 'اسأل آريا' : 'Ask ARIA'}
                  <ChevronRight size={12} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
