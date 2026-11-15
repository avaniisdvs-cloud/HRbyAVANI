'use client'

import { useState } from 'react'
import { Brain, Database, Shield, Cpu } from 'lucide-react'

export interface ReasoningStep {
  id:          string
  description: string
  time:        string
}

interface Props {
  steps:  ReasoningStep[]
  locale: 'en' | 'ar'
  callsToday:    number
  voiceToday:    number
  accuracyPct:   number
}

type Tab = 'reasoning' | 'sources' | 'safety'

const DATA_SOURCES = [
  { id: 'hr-db',    labelEn: 'HR Database',     labelAr: 'قاعدة بيانات الموارد البشرية', status: 'live' },
  { id: 'leave',    labelEn: 'Leave Records',    labelAr: 'سجلات الإجازات',               status: 'live' },
  { id: 'docs',     labelEn: 'Document Vault',   labelAr: 'خزنة المستندات',               status: 'live' },
  { id: 'wf',       labelEn: 'Workflow Engine',  labelAr: 'محرك سير العمل',              status: 'live' },
  { id: 'policies', labelEn: 'Policy Library',   labelAr: 'مكتبة السياسات',              status: 'idle' },
  { id: 'uae-law',  labelEn: 'UAE Labour Law',   labelAr: 'قانون العمل الإماراتي',       status: 'idle' },
]

const SAFETY_CHECKS = [
  { id: 'pii',     labelEn: 'PII Redaction',         labelAr: 'إخفاء البيانات الشخصية', pass: true  },
  { id: 'role',    labelEn: 'Role-based Access',      labelAr: 'التحكم بالصلاحيات',       pass: true  },
  { id: 'audit',   labelEn: 'Audit Trail Logging',    labelAr: 'تسجيل سجل التدقيق',       pass: true  },
  { id: 'content', labelEn: 'Content Policy Check',   labelAr: 'فحص سياسة المحتوى',       pass: true  },
  { id: 'pdpl',    labelEn: 'UAE PDPL Compliance',    labelAr: 'امتثال PDPL الإماراتي',   pass: true  },
]

export default function AriaReasoningPanel({ steps, locale, callsToday, voiceToday, accuracyPct }: Props) {
  const [tab, setTab] = useState<Tab>('reasoning')
  const isRtl = locale === 'ar'

  const tabs: { id: Tab; labelEn: string; labelAr: string; icon: React.ElementType }[] = [
    { id: 'reasoning', labelEn: 'Reasoning', labelAr: 'الاستدلال', icon: Brain    },
    { id: 'sources',   labelEn: 'Sources',   labelAr: 'المصادر',   icon: Database },
    { id: 'safety',    labelEn: 'Safety',    labelAr: 'الأمان',    icon: Shield   },
  ]

  return (
    <>
      <style>{`
        @keyframes aria-live-ping {
          0%   { box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 60%, transparent); }
          70%  { box-shadow: 0 0 0 6px transparent; }
          100% { box-shadow: 0 0 0 0 transparent; }
        }
        @keyframes aria-pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.5; }
        }
        @keyframes shimmer {
          0%   { background-position: -200% 0; }
          100% { background-position:  200% 0; }
        }
      `}</style>
      <aside
        dir={isRtl ? 'rtl' : 'ltr'}
        style={{
          width: 280,
          flexShrink: 0,
          background: 'var(--nav-bg)',
          borderInlineStart: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '14px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div>
              <div style={{
                fontSize: 'var(--text-caption)',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--brand-active)',
              }}>
                ARIA
              </div>
              <div style={{
                fontSize: 'var(--text-caption)',
                fontWeight: 600,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.45)',
                marginTop: 2,
              }}>
                {locale === 'ar' ? 'سطح الاستدلال' : 'REASONING SURFACE'}
              </div>
            </div>
            <div style={{
              marginLeft: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}>
              <span style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: 'var(--accent)',
                display: 'inline-block',
                flexShrink: 0,
                animation: 'aria-live-ping 2s infinite',
              }} />
              <span style={{ fontSize: 'var(--text-caption)', fontWeight: 700, color: 'var(--brand-active)' }}>
                {locale === 'ar' ? 'مباشر' : 'LIVE'}
              </span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          padding: '0 16px',
          display: 'flex',
          flexShrink: 0,
        }}>
          {tabs.map(t => {
            const Icon    = t.icon
            const active  = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  fontSize: 'var(--text-caption)',
                  fontWeight: active ? 500 : 500,
                  color: active ? 'white' : 'rgba(255,255,255,0.45)',
                  background: 'none',
                  borderTopWidth: "0px",
                  borderTopStyle: "none",
                  borderTopColor: "currentColor",
                  borderRightWidth: "0px",
                  borderRightStyle: "none",
                  borderRightColor: "currentColor",
                  borderLeftWidth: "0px",
                  borderLeftStyle: "none",
                  borderLeftColor: "currentColor",
                  cursor: 'pointer',
                  borderBottomWidth: "2px",
                  borderBottomStyle: "solid",
                  borderBottomColor: (active) ? "var(--accent)" : "transparent",
                  marginBottom: -1,
                  transition: 'color 0.15s',
                }}
                onMouseEnter={e => {
                  if (!active) e.currentTarget.style.color = 'rgba(255,255,255,0.75)'
                }}
                onMouseLeave={e => {
                  if (!active) e.currentTarget.style.color = 'rgba(255,255,255,0.45)'
                }}
              >
                <Icon size={12} strokeWidth={active ? 2.5 : 1.75} aria-hidden />
                {locale === 'ar' ? t.labelAr : t.labelEn}
              </button>
            )
          })}
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>

          {tab === 'reasoning' && (
            <div>
              {steps.length === 0 ? (
                <p style={{ fontSize: 'var(--text-caption)', color: 'rgba(255,255,255,0.35)', fontStyle: 'italic', textAlign: 'center',
                marginTop: 24 }}>
                  {locale === 'ar'
                    ? 'سيظهر استدلال ARIA هنا عند أول طلب.'
                    : 'ARIA reasoning steps will appear here after the first request.'}
                </p>
              ) : (
                steps.map(step => (
                  <div key={step.id} style={{
                    display: 'flex',
                    gap: 10,
                    padding: '8px 0',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                  }}>
                    <span style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: 'var(--accent)',
                      flexShrink: 0,
                      marginTop: 3,
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 'var(--text-caption)', color: 'rgba(255,255,255,0.8)', margin: 0, lineHeight: 1.4 }}>
                        {step.description}
                      </p>
                      <p style={{ fontSize: 'var(--text-caption)', color: 'rgba(255,255,255,0.3)', margin: '2px 0 0' }}>
                        {step.time}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'sources' && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {DATA_SOURCES.map(src => (
                <div key={src.id} style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 6,
                  padding: '8px 12px',
                  marginBottom: 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                  <span style={{ fontSize: 'var(--text-caption)', color: 'rgba(255,255,255,0.7)' }}>
                    {locale === 'ar' ? src.labelAr : src.labelEn}
                  </span>
                  <span style={{
                    fontSize: 'var(--text-caption)',
                    fontWeight: 700,
                    letterSpacing: '0.05em',
                    padding: '2px 6px',
                    borderRadius: 3,
                    background: src.status === 'live'
                      ? 'color-mix(in srgb, var(--accent) 15%, transparent)'
                      : 'rgba(255,255,255,0.06)',
                    color: src.status === 'live' ? 'var(--brand-active)' : 'rgba(255,255,255,0.35)',
                    border: src.status === 'live'
                      ? '1px solid color-mix(in srgb, var(--accent) 40%, transparent)'
                      : '1px solid rgba(255,255,255,0.12)',
                  }}>
                    {src.status === 'live'
                      ? (locale === 'ar' ? 'نشط' : 'LIVE')
                      : (locale === 'ar' ? 'خامل' : 'IDLE')}
                  </span>
                </div>
              ))}
            </div>
          )}

          {tab === 'safety' && (
            <div>
              {SAFETY_CHECKS.map(chk => (
                <div key={chk.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 0',
                }}>
                  <span style={{
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    flexShrink: 0,
                    background: chk.pass
                      ? 'color-mix(in srgb, var(--status-approved-fg) 15%, transparent)'
                      : 'color-mix(in srgb, var(--status-rejected-fg) 15%, transparent)',
                    border: chk.pass
                      ? '1.5px solid var(--status-approved-fg)'
                      : '1.5px solid var(--status-rejected-fg)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 'var(--text-caption)',
                    color: chk.pass ? 'var(--status-approved-fg)' : 'var(--status-rejected-fg)',
                    fontWeight: 700,
                  }}>
                    {chk.pass ? '✓' : '✗'}
                  </span>
                  <span style={{ fontSize: 'var(--text-caption)', color: 'rgba(255,255,255,0.75)' }}>
                    {locale === 'ar' ? chk.labelAr : chk.labelEn}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer — model info + usage */}
        <div style={{
          padding: '10px 14px',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          flexShrink: 0,
          background: 'rgba(0,0,0,0.12)',
        }}>
          <div style={{ fontSize: 'var(--text-caption)', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            MODEL
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6,
          marginTop: 6 }}>
            <span style={{
              background: 'color-mix(in srgb, var(--accent) 40%, transparent)',
              border: '1px solid color-mix(in srgb, var(--accent) 60%, transparent)',
              borderRadius: 4,
              padding: '3px 8px',
              fontSize: 'var(--text-caption)',
              fontWeight: 600,
              color: 'rgba(255,255,255,0.85)',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}>
              <Cpu size={10} aria-hidden />
              Claude Sonnet
            </span>
            <span style={{
              background: 'color-mix(in srgb, var(--accent) 40%, transparent)',
              border: '1px solid color-mix(in srgb, var(--accent) 60%, transparent)',
              borderRadius: 4,
              padding: '3px 8px',
              fontSize: 'var(--text-caption)',
              fontWeight: 600,
              color: 'rgba(255,255,255,0.85)',
            }}>
              pgvector RAG
            </span>
          </div>
          <p style={{ fontSize: 'var(--text-caption)', color: 'rgba(255,255,255,0.35)', margin: '6px 0 0' }}>
            {locale === 'ar'
              ? `اليوم: ${callsToday} طلب · ${voiceToday} صوتي · ${accuracyPct}% دقة`
              : `Today: ${callsToday} calls · ${voiceToday} voice · ${accuracyPct}% accuracy`}
          </p>
        </div>
      </aside>
    </>
  )
}
