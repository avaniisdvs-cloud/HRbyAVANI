'use client'

import { BrandText } from '@/components/providers/BrandingProvider'
import { AlertTriangle } from 'lucide-react'
import type { EmployeeAriaContext } from '@/modules/aria'

interface EmployeeAriaWelcomeProps {
  context:       EmployeeAriaContext
  onPromptClick: (prompt: string) => void
  locale:        'en' | 'ar'
  userName:      string
}

const quickActions = [
  {
    icon: '📅',
    labelEn: 'What is my leave balance?',
    labelAr: 'ما هو رصيد إجازتي؟',
    promptEn: 'What is my leave balance?',
    promptAr: 'ما هو رصيد إجازتي؟',
  },
  {
    icon: '✏️',
    labelEn: 'Apply for annual leave',
    labelAr: 'تقديم طلب إجازة سنوية',
    promptEn: 'Apply for annual leave',
    promptAr: 'تقديم طلب إجازة سنوية',
  },
  {
    icon: '🏥',
    labelEn: 'I need sick leave tomorrow',
    labelAr: 'أحتاج إجازة مرضية غداً',
    promptEn: 'I need sick leave tomorrow',
    promptAr: 'أحتاج إجازة مرضية غداً',
  },
  {
    icon: '📋',
    labelEn: 'Check my pending requests',
    labelAr: 'تحقق من طلباتي المعلقة',
    promptEn: 'Check my pending requests',
    promptAr: 'تحقق من طلباتي المعلقة',
  },
  {
    icon: '👤',
    labelEn: 'Who is my line manager?',
    labelAr: 'من هو مديري المباشر؟',
    promptEn: 'Who is my line manager?',
    promptAr: 'من هو مديري المباشر؟',
  },
  {
    icon: '🗓️',
    labelEn: 'When is the next public holiday?',
    labelAr: 'متى العطلة الرسمية القادمة؟',
    promptEn: 'When is the next public holiday?',
    promptAr: 'متى العطلة الرسمية القادمة؟',
  },
]

function getBannerStyles(severity: 'critical' | 'warning' | 'info'): {
  background: string
  border: string
  color: string
} {
  if (severity === 'critical') {
    return {
      background: 'var(--status-rejected-bg)',
      border: '1px solid var(--status-rejected-fg)',
      color: 'var(--status-rejected-fg)',
    }
  }
  if (severity === 'warning') {
    return {
      background: 'var(--status-pending-bg)',
      border: '1px solid var(--status-pending-fg)',
      color: 'var(--status-pending-fg)',
    }
  }
  return {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    color: 'var(--ink-3)',
  }
}

export default function EmployeeAriaWelcome({
  context,
  onPromptClick,
  locale,
  userName,
}: EmployeeAriaWelcomeProps) {
  const isAr = locale === 'ar'

  // Feature D — compute context chips
  interface Chip {
    label: string
    prompt: string
  }
  const contextChips: Chip[] = []

  // 1. Pending requests
  if (context.pendingRequestsCount > 0) {
    const count = context.pendingRequestsCount
    contextChips.push({
      label: isAr
        ? `📋 ${count} طلب${count > 1 ? 'ات' : ''} معلقة — تحقق من الحالة`
        : `📋 ${count} pending request${count > 1 ? 's' : ''} — check status`,
      prompt: 'What is the status of my pending leave requests?',
    })
  }

  // 2. Low balance
  const lowBalance = context.balances.find((b) => b.colorCode === 'red')
  if (lowBalance) {
    contextChips.push({
      label: isAr
        ? `⚠️ رصيد ${lowBalance.leaveTypeNameAr} منخفض (${lowBalance.availableDays} أيام متبقية)`
        : `⚠️ Your ${lowBalance.leaveTypeName} balance is running low (${lowBalance.availableDays} days left)`,
      prompt: `I only have ${lowBalance.availableDays} days of ${lowBalance.leaveTypeName} leave left. What are my options?`,
    })
  }

  // 3. Upcoming holiday (within 14 days)
  if (context.nextHoliday && context.nextHoliday.daysUntil <= 14) {
    const h = context.nextHoliday
    contextChips.push({
      label: isAr
        ? `🎉 ${h.nameAr} بعد ${h.daysUntil} أيام (${h.date})`
        : `🎉 ${h.name} in ${h.daysUntil} days (${h.date})`,
      prompt: `Tell me about the ${h.name} holiday and how many days off I get.`,
    })
  }

  // 4. No pending, has balances (fill up to max 3)
  if (contextChips.length < 3 && context.pendingRequestsCount === 0 && context.balances.length > 0) {
    contextChips.push({
      label: isAr
        ? '✅ لا توجد طلبات معلقة — هل أنت مستعد للتقديم؟'
        : '✅ No pending requests — ready to apply?',
      prompt: "I'd like to apply for annual leave. Can you help me?",
    })
  }

  const displayedDocs = context.expiringDocuments.slice(0, 2)
  const remainingDocs = context.expiringDocuments.length - displayedDocs.length

  const sectionHeaderStyle: React.CSSProperties = {
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--ink-3)',
    margin: '0 0 10px',
  }

  const quickActionButtonBase: React.CSSProperties = {
    padding: '12px 14px',
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: '10px',
    cursor: 'pointer',
    textAlign: 'left',
    fontSize: '13px',
    color: 'var(--ink-2)',
    fontFamily: 'var(--font-sans)',
    fontWeight: 500,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
    transition: 'all 0.15s ease',
  }

  const chipBase: React.CSSProperties = {
    padding: '8px 14px',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: '999px',
    cursor: 'pointer',
    fontSize: '12.5px',
    color: 'var(--ink-2)',
    fontFamily: 'var(--font-sans)',
    fontWeight: 500,
    whiteSpace: 'nowrap',
    flexShrink: 0,
    transition: 'all 0.15s ease',
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        padding: '24px',
        maxWidth: '600px',
        margin: '0 auto',
        width: '100%',
      }}
    >
      {/* Feature I — Document expiry alert banners */}
      {context.expiringDocuments.length > 0 && (
        <div>
          {displayedDocs.map((doc, index) => {
            const bannerStyles = getBannerStyles(doc.severity)
            return (
              <div
                key={index}
                onClick={() =>
                  onPromptClick(
                    `My ${doc.documentType} expires on ${doc.expiryDate}. What do I need to do?`
                  )
                }
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  padding: '12px 16px',
                  borderRadius: '10px',
                  marginBottom: '8px',
                  cursor: 'pointer',
                  background: bannerStyles.background,
                  border: bannerStyles.border,
                  color: bannerStyles.color,
                }}
              >
                <AlertTriangle
                  size={15}
                  style={{ flexShrink: 0, marginTop: '1px' }}
                />
                <div>
                  <span
                    style={{
                      fontSize: '13px',
                      fontWeight: 600,
                      display: 'block',
                    }}
                  >
                    {doc.documentType} expires in {doc.daysUntil} days — {doc.expiryDate}
                  </span>
                  <span
                    style={{
                      fontSize: '12px',
                      color: 'var(--ink-3)',
                      display: 'block',
                      marginTop: '2px',
                    }}
                  >
                    Click to ask ARIA what to do
                  </span>
                </div>
              </div>
            )
          })}
          {remainingDocs > 0 && (
            <p
              style={{
                fontSize: '12px',
                color: 'var(--ink-3)',
                margin: '0 0 4px',
              }}
            >
              + {remainingDocs} more expiring
            </p>
          )}
        </div>
      )}

      {/* Greeting */}
      <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
        <p
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: '24px',
            fontWeight: 500,
            color: 'var(--ink-1)',
            margin: '0 0 4px',
          }}
        >
          {isAr ? 'آريا' : 'ARIA'}
        </p>
        <p style={{ fontSize: '13px', color: 'var(--ink-3)', margin: 0 }}>
          <BrandText>{isAr ? 'مساعدك في AVANIIS HR' : 'Your AVANIIS HR Assistant'}</BrandText>
        </p>
      </div>

      {/* Feature C — Quick Actions grid */}
      <div>
        <p style={sectionHeaderStyle}>
          {isAr ? 'الإجراءات السريعة' : 'Quick Actions'}
        </p>
        <div
          data-responsive-grid="true" style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '8px',
          }}
        >
          {quickActions.map((action, index) => (
            <button
              key={index}
              onClick={() =>
                onPromptClick(isAr ? action.promptAr : action.promptEn)
              }
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent)'
                e.currentTarget.style.color = 'var(--accent)'
                e.currentTarget.style.background = 'var(--surface)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border)'
                e.currentTarget.style.color = 'var(--ink-2)'
                e.currentTarget.style.background = 'var(--card)'
              }}
              style={quickActionButtonBase}
            >
              <span>{action.icon}</span>
              <span>{isAr ? action.labelAr : action.labelEn}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Feature D — For You chips */}
      {contextChips.length > 0 && (
        <div>
          <p style={sectionHeaderStyle}>
            {isAr ? 'مقترحات لك' : 'For You'}
          </p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {contextChips.map((chip, index) => (
              <button
                key={index}
                onClick={() => onPromptClick(chip.prompt)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--accent)'
                  e.currentTarget.style.color = 'var(--accent)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border)'
                  e.currentTarget.style.color = 'var(--ink-2)'
                }}
                style={chipBase}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
