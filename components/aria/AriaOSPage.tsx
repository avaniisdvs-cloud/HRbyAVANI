'use client'

import { PageTitle } from '@/components/ui/typography'
import {
  Home, CheckSquare, Bell, Users, BarChart3,
  GitBranch, Shield, BookOpen, FileText, ScrollText, Bot,
} from 'lucide-react'
import { useState } from 'react'
import type { AriaSessionContext } from '@/modules/aria'
import { type AriaOSView } from './AriaOSSidebar'
import AriaOSHome, { type AriaOSKpis } from './AriaOSHome'
import AriaReasoningPanel, { type ReasoningStep } from './AriaReasoningPanel'
import AriaChatClient from './AriaChatClient'
import AriaApprovalsView       from './views/AriaApprovalsView'
import AriaAlertsView          from './views/AriaAlertsView'
import AriaPeopleView          from './views/AriaPeopleView'
import AriaReportsView         from './views/AriaReportsView'
import AriaWorkflowsView       from './views/AriaWorkflowsView'
import AriaComplianceView      from './views/AriaComplianceView'
import AriaUAELawView          from './views/AriaUAELawView'
import AriaCompanyPoliciesView from './views/AriaCompanyPoliciesView'
import AriaAuditLogView        from './views/AriaAuditLogView'

const OS_ROLES = ['MANAGER', 'HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN']

const VIEW_TITLE: Record<AriaOSView, string> = {
  'home':             'Command Center',
  'chat':             'ARIA Chat',
  'approvals':        'Pending Approvals',
  'alerts':           'Alerts & Deadlines',
  'people':           'People Intelligence',
  'reports':          'Reports',
  'workflows':        'Workflow Status',
  'compliance':       'Compliance Overview',
  'uae-law':          'UAE Labour Law',
  'company-policies': 'Company Policies',
  'audit-log':        'Audit Log',
}

interface TabEntry {
  id:      AriaOSView
  labelEn: string
  labelAr: string
  icon:    React.ElementType
  badge?:  number
}

function buildTabs(pendingApprovals: number): TabEntry[] {
  return [
    { id: 'home',             labelEn: 'Home',             labelAr: 'الرئيسية',               icon: Home        },
    { id: 'chat',             labelEn: 'ARIA',              labelAr: 'آريا',                   icon: Bot         },
    { id: 'approvals',        labelEn: 'Approvals',         labelAr: 'الموافقات',              icon: CheckSquare, badge: pendingApprovals },
    { id: 'alerts',           labelEn: 'Alerts',            labelAr: 'التنبيهات',              icon: Bell        },
    { id: 'people',           labelEn: 'People',            labelAr: 'الأفراد',                icon: Users       },
    { id: 'reports',          labelEn: 'Reports',           labelAr: 'التقارير',               icon: BarChart3   },
    { id: 'workflows',        labelEn: 'Workflows',         labelAr: 'سير العمل',              icon: GitBranch   },
    { id: 'compliance',       labelEn: 'Compliance',        labelAr: 'الامتثال',               icon: Shield      },
    { id: 'uae-law',          labelEn: 'UAE Law',           labelAr: 'قانون العمل',            icon: BookOpen    },
    { id: 'company-policies', labelEn: 'Policies',          labelAr: 'السياسات',               icon: FileText    },
    { id: 'audit-log',        labelEn: 'Audit Log',         labelAr: 'سجل التدقيق',            icon: ScrollText  },
  ]
}

interface Props {
  sessionCtx: AriaSessionContext
  kpis:       AriaOSKpis
  locale:     'en' | 'ar'
  userName:   string
}

export default function AriaOSPage({ sessionCtx, kpis, locale, userName }: Props) {
  const { role } = sessionCtx
  const isOSRole      = OS_ROLES.includes(role)
  const showReasoning = role === 'SUPER_ADMIN'

  const [activeView, setActiveView]         = useState<AriaOSView>('home')
  const [chatPrompt, setChatPrompt]         = useState('')
  const [reasoningSteps, setReasoningSteps] = useState<ReasoningStep[]>([])

  function addReasoningStep(step: ReasoningStep) {
    setReasoningSteps(prev => [step, ...prev].slice(0, 20))
  }

  function askAria(prompt: string) {
    setChatPrompt(prompt)
    setActiveView('chat')
  }

  function navigate(view: AriaOSView) {
    if (view !== 'chat') setChatPrompt('')
    setActiveView(view)
  }

  if (!isOSRole) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        <AriaChatClient sessionCtx={sessionCtx} userRole={role} />
      </div>
    )
  }

  function renderContent() {
    switch (activeView) {
      case 'home':
        return (
          <AriaOSHome
            kpis={kpis}
            sessionCtx={sessionCtx}
            locale={locale}
            userName={userName}
            onPromptClick={askAria}
            onReasoningStep={addReasoningStep}
          />
        )
      case 'chat':
        return (
          <div style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <AriaChatClient sessionCtx={sessionCtx} prefilledPrompt={chatPrompt} userRole={role} />
          </div>
        )
      case 'approvals':        return <AriaApprovalsView onAskAria={askAria} />
      case 'alerts':           return <AriaAlertsView onAskAria={askAria} />
      case 'people':           return <AriaPeopleView onAskAria={askAria} sessionCtx={sessionCtx} />
      case 'reports':          return <AriaReportsView onAskAria={askAria} userRole={role} locale={locale} />
      case 'workflows':        return <AriaWorkflowsView onAskAria={askAria} />
      case 'compliance':       return <AriaComplianceView onAskAria={askAria} />
      case 'uae-law':          return <AriaUAELawView onAskAria={askAria} locale={locale} />
      case 'company-policies': return <AriaCompanyPoliciesView onAskAria={askAria} />
      case 'audit-log':        return <AriaAuditLogView sessionCtx={sessionCtx} onAskAria={askAria} />
    }
  }

  const headerTitle = locale === 'ar'
    ? (activeView === 'chat' ? 'محادثة ARIA' : VIEW_TITLE[activeView])
    : VIEW_TITLE[activeView]

  const tabs = buildTabs(kpis.pendingApprovals)

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: 'var(--bg)' }}>
      {/* Visually-hidden h1 for screen readers and Playwright heading detection (WCAG 1.3.1) */}
      <PageTitle style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>
        ARIA OS
      </PageTitle>

      {/* Main content — full width, no secondary sidebar */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* View header bar */}
        <div style={{
          padding: '14px 24px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          background: 'var(--card)',
        }}>
          <span style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 18,
            fontWeight: 600,
            color: 'var(--ink-1)',
          }}>
            {headerTitle}
          </span>

          {/* ARIA OS label */}
          <span style={{
            marginLeft: 12,
            fontSize: 'var(--text-caption)',
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--brand-active)',
            padding: '2px 8px',
            borderRadius: 4,
            border: '1px solid var(--accent-200)',
            background: 'var(--accent-050)',
          }}>
            ARIA OS
          </span>
        </div>

        {/* Horizontal tab strip */}
        <div
          role="tablist"
          dir={locale === 'ar' ? 'rtl' : 'ltr'}
          style={{
            display: 'flex',
            alignItems: 'stretch',
            gap: 0,
            background: 'var(--card)',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
            overflowX: 'auto',
            scrollbarWidth: 'none',
          }}
        >
          {tabs.map(tab => {
            const active = activeView === tab.id
            const Icon   = tab.icon
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={active}
                onClick={() => navigate(tab.id)}
                aria-current={active ? 'page' : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '10px 16px',
                  flexShrink: 0,
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
                  borderBottomColor: (active) ? "var(--accent)" : "transparent",
                  background: 'transparent',
                  color: active ? 'var(--brand-active)' : 'var(--ink-3)',
                  fontWeight: active ? 600 : 400,
                  fontSize: 'var(--text-caption)',
                  fontFamily: 'var(--font-sans)',
                  cursor: 'pointer',
                  transition: 'color 0.15s, border-color 0.15s',
                  position: 'relative',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => {
                  if (!active) e.currentTarget.style.color = 'var(--ink-1)'
                }}
                onMouseLeave={e => {
                  if (!active) e.currentTarget.style.color = 'var(--ink-3)'
                }}
              >
                <Icon
                  size={13}
                  strokeWidth={active ? 2 : 1.75}
                  aria-hidden
                />
                {locale === 'ar' ? tab.labelAr : tab.labelEn}
                {tab.badge != null && tab.badge > 0 && (
                  <span style={{
                    fontSize: 'var(--text-caption)',
                    fontWeight: 700,
                    minWidth: 16,
                    height: 16,
                    borderRadius: 8,
                    background: 'var(--accent)',
                    color: "var(--on-accent)",
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 4px',
                  }}>
                    {tab.badge > 99 ? '99+' : tab.badge}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Content area */}
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {renderContent()}
        </div>
      </div>

      {/* Right reasoning panel — SUPER_ADMIN only */}
      {showReasoning && (
        <AriaReasoningPanel
          steps={reasoningSteps}
          locale={locale}
          callsToday={0}
          voiceToday={0}
          accuracyPct={0}
        />
      )}
    </div>
  )
}
