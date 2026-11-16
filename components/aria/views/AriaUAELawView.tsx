'use client'

import { SectionTitle } from '@/components/ui/typography'
import { useState } from 'react'
import { Search, ChevronRight } from 'lucide-react'
import { type Locale } from '@/lib/i18n'

interface Props {
  onAskAria: (prompt: string) => void
  locale?:   Locale
}

const LAW_TOPICS = [
  {
    title: 'Employment Contracts',
    titleAr: 'عقود العمل',
    article: 'Articles 8–17',
    points: [
      'Fixed-term contracts: maximum 3 years',
      'Probation period: maximum 6 months',
      'Notice period: minimum 1 month',
      'Contract must be in Arabic + English',
    ],
    prompt: 'Explain employment contract rules under UAE Labour Law Federal Law No. 33 of 2021 including probation, notice period and fixed-term limits.',
  },
  {
    title: 'Annual Leave',
    titleAr: 'الإجازة السنوية',
    article: 'Article 29',
    points: [
      '30 calendar days after 1 year service',
      '2 days per month for 6–12 months service',
      'DIFC entities: 20 working days',
      'Leave pay at basic salary + allowances',
    ],
    prompt: 'Explain annual leave entitlements under UAE Labour Law Article 29 including accrual rules and DIFC differences.',
  },
  {
    title: 'Sick Leave',
    titleAr: 'إجازة مرضية',
    article: 'Article 31',
    points: [
      'First 15 days: full pay',
      'Next 30 days: half pay',
      'Following 45 days: unpaid',
      'Medical certificate required after 3 days',
    ],
    prompt: 'Explain sick leave rules under UAE Labour Law Article 31 including pay tiers and medical certificate requirements.',
  },
  {
    title: 'Gratuity (EOSB)',
    titleAr: 'مكافأة نهاية الخدمة',
    article: 'Articles 51–54, FDL 9/2024',
    points: [
      'Years 1–5: 21 days basic salary per year',
      'Beyond 5 years: 30 days per year',
      'Capped at 2 years total basic salary',
      'Payable on resignation (FDL 9/2024)',
    ],
    prompt: 'Explain gratuity (EOSB) calculation rules under UAE Labour Law including the FDL 9/2024 update on resignation.',
  },
  {
    title: 'Working Hours',
    titleAr: 'ساعات العمل',
    article: 'Articles 17–20',
    points: [
      '8 hours per day / 48 hours per week',
      'Ramadan: reduced to 6 hours per day',
      'Overtime: 1.25× for weekdays',
      'Friday overtime: 1.5× rate',
    ],
    prompt: 'Explain working hours rules under UAE Labour Law including Ramadan hours and overtime rates.',
  },
  {
    title: 'Maternity & Paternity',
    titleAr: 'إجازة الأمومة والأبوة',
    article: 'Articles 30, 32',
    points: [
      'Maternity: 60 days (45 full + 15 half pay)',
      'Cannot terminate during maternity leave',
      'Paternity: 5 working days within 6 months',
      'Nursing breaks: 2 per day for 6 months',
    ],
    prompt: 'Explain maternity and paternity leave rules under UAE Labour Law including pay, duration and termination protection.',
  },
  {
    title: 'Termination & Notice',
    titleAr: 'إنهاء الخدمة والإشعار',
    article: 'Articles 42–50',
    points: [
      'Notice: 1 month (< 5 yrs), 3 months (5+ yrs)',
      'Arbitrary dismissal: compensation required',
      'No termination during sick/maternity leave',
      'Garden leave allowed during notice period',
    ],
    prompt: 'Explain termination and notice period rules under UAE Labour Law including arbitrary dismissal compensation.',
  },
  {
    title: 'GPSSA (UAE Nationals)',
    titleAr: 'هيئة التقاعد والمعاشات',
    article: 'Federal Law No. 57/2023',
    points: [
      'Employer contribution: 15% of basic salary',
      'Employee contribution: 5% of basic salary',
      'Replaces EOSB for UAE Nationals',
      'Submit by 15th of each month',
    ],
    prompt: 'Explain GPSSA pension rules for UAE Nationals including employer and employee contribution rates and submission deadlines.',
  },
]

export default function AriaUAELawView({ onAskAria, locale = 'en' }: Props) {
  const isAr = locale === 'ar'
  const [query, setQuery] = useState('')

  const filtered = query.trim()
    ? LAW_TOPICS.filter(t =>
        t.title.toLowerCase().includes(query.toLowerCase()) ||
        t.points.some(p => p.toLowerCase().includes(query.toLowerCase()))
      )
    : LAW_TOPICS

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ flexShrink: 0, padding: '20px 24px 16px', borderBottom: '1px solid var(--border)' }}>
        <SectionTitle style={{
          fontFamily: 'var(--font-serif)',
          fontSize: '20px',
          fontWeight: 600,
          color: 'var(--ink-1)',
          margin: '0 0 2px',
        }}>
          {isAr ? 'قانون العمل الإماراتي' : 'UAE Labour Law'}
        </SectionTitle>
        <p style={{ fontSize: '12px', color: 'var(--ink-3)', margin: '0 0 14px' }}>
          {isAr ? 'القانون الاتحادي رقم 33 لسنة 2021' : 'Federal Law No. 33 of 2021'}
        </p>

        <div style={{ position: 'relative' }}>
          <Search
            size={14}
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--ink-4)',
              pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && query.trim()) {
                onAskAria(`Under UAE Labour Law Federal Law No. 33 of 2021: ${query.trim()}`)
              }
            }}
            placeholder={isAr ? 'ابحث في مواضيع القانون أو اضغط Enter لسؤال آريا...' : 'Search law topics or press Enter to ask ARIA...'}
            style={{
              width: '100%',
              padding: '9px 12px 9px 34px',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              fontSize: '13px',
              color: 'var(--ink-1)',
              background: 'var(--surface)',
              outline: 'none',
              boxSizing: 'border-box',
              fontFamily: 'var(--font-sans)',
            }}
          />
        </div>
      </div>

      {/* Topic cards — scrollable */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}>
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', paddingTop: '40px', color: 'var(--ink-4)', fontSize: '13px' }}>
            {isAr ? 'لا توجد مواضيع تطابق بحثك. اضغط Enter لسؤال آريا.' : 'No topics match your search. Press Enter to ask ARIA.'}
          </div>
        )}

        {filtered.map(topic => (
          <div
            key={topic.title}
            style={{
              background: 'var(--card)',
              borderLeft: '4px solid var(--accent)',
              borderTop: '1px solid var(--border)',
              borderRight: '1px solid var(--border)',
              borderBottom: '1px solid var(--border)',
              borderRadius: '0 10px 10px 0',
              padding: '14px 16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div>
                <span
                  style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink-1)', fontFamily: 'var(--font-sans)' }}
                  {...(isAr ? { dir: 'rtl' as const, lang: 'ar' } : {})}
                >
                  {isAr ? topic.titleAr : topic.title}
                </span>
              </div>
              <span style={{ fontSize: '10px', color: 'var(--ink-4)', fontWeight: 500, whiteSpace: 'nowrap', marginTop: '2px' }}>
                {topic.article}
              </span>
            </div>

            <ul style={{ margin: '0 0 10px', padding: '0 0 0 16px', listStyle: 'disc' }}>
              {topic.points.map(point => (
                <li key={point} style={{ fontSize: '12px', color: 'var(--ink-2)', lineHeight: '1.6', marginBottom: '2px' }}>
                  {point}
                </li>
              ))}
            </ul>

            <button
              onClick={() => onAskAria(topic.prompt)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '12px',
                color: 'var(--brand-active)',
                fontFamily: 'var(--font-sans)',
                fontWeight: 500,
                padding: 0,
              }}
            >
              {isAr ? 'اسأل آريا عن التفاصيل الكاملة' : 'Ask ARIA for full details'}
              <ChevronRight size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
