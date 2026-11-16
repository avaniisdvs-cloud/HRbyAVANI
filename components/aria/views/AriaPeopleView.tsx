'use client'

import { SectionTitle } from '@/components/ui/typography'
import { useState, useEffect, useCallback } from 'react'
import { Users, UserCheck, UserPlus, Search, RefreshCw } from 'lucide-react'
import { getPeopleIntelligence } from '@/modules/aria'
import type { PeopleIntelligence, AriaSessionContext } from '@/modules/aria'
import { useLocale } from '@/components/providers/LocaleProvider'
import { tk } from '@/lib/i18n-messages'

interface Props {
  onAskAria:  (prompt: string) => void
  sessionCtx: AriaSessionContext
}

const SUGGESTED_PROMPTS_ADMIN = [
  'Which department has the highest headcount right now?',
  'Who are the new joiners this month?',
  'Which employees are on leave today?',
  'Show me employees with contracts expiring in the next 30 days.',
]

const SUGGESTED_PROMPTS_ADMIN_AR = [
  'ما هو القسم الذي يضم أكبر عدد من الموظفين حالياً؟',
  'من هم الموظفون الجدد هذا الشهر؟',
  'من هم الموظفون في إجازة اليوم؟',
  'أظهر لي الموظفين الذين تنتهي عقودهم خلال الثلاثين يوماً القادمة.',
]

const SUGGESTED_PROMPTS_MANAGER = [
  'Who from my team is on leave today?',
  'Who are the new joiners in my team this month?',
  'What is the leave balance for each of my team members?',
  'Show me document expiry alerts for my team.',
]

const SUGGESTED_PROMPTS_MANAGER_AR = [
  'من في فريقي في إجازة اليوم؟',
  'من هم الموظفون الجدد في فريقي هذا الشهر؟',
  'ما هو رصيد الإجازات لكل عضو في فريقي؟',
  'أظهر لي تنبيهات انتهاء المستندات لفريقي.',
]

function KPICard({
  icon,
  label,
  value,
  loading,
}: {
  icon: React.ReactNode
  label: string
  value: number
  loading: boolean
}) {
  return (
    <div style={{
      flex: '1 1 140px',
      background: 'var(--card)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: '18px 20px',
      minWidth: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ color: 'var(--brand-active)', flexShrink: 0 }}>{icon}</span>
        <p style={{
          margin: 0,
          fontSize: 'var(--text-caption)',
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--ink-3)',
          fontFamily: 'var(--font-mono, monospace)',
        }}>
          {label}
        </p>
      </div>
      {loading ? (
        <div style={{ height: 32, width: 60, borderRadius: 6, background: 'var(--surface)' }} />
      ) : (
        <p style={{
          margin: 0,
          fontSize: 32,
          fontWeight: 700,
          color: 'var(--ink-1)',
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1,
        }}>
          {value.toLocaleString()}
        </p>
      )}
    </div>
  )
}

function DeptBar({ name, count, max }: { name: string; count: number; max: number }) {
  const pct = max > 0 ? (count / max) * 100 : 0
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 'var(--text-body)', color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>
          {name}
        </span>
        <span style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink-1)', fontVariantNumeric: 'tabular-nums', flexShrink: 0, marginLeft: 8 }}>
          {count}
        </span>
      </div>
      <div style={{ height: 7, background: 'var(--surface)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: 'var(--accent)',
          borderRadius: 4,
          transition: 'width 0.5s ease',
        }} />
      </div>
    </div>
  )
}

export default function AriaPeopleView({ onAskAria, sessionCtx }: Props) {
  const locale = useLocale()
  const isManager = sessionCtx.role === 'MANAGER'
  const managerId = isManager ? sessionCtx.personId : undefined

  const [data, setData]       = useState<PeopleIntelligence | null>(null)
  const [loading, setLoading] = useState(true)
  const [query, setQuery]     = useState('')

  const load = useCallback(() => {
    setLoading(true)
    ;(async () => {
      try {
        const result = await getPeopleIntelligence(managerId)
        setData(result)
      } catch (e) {
        console.error('[People]', e)
      } finally {
        setLoading(false)
      }
    })()
  }, [managerId])

  useEffect(() => { load() }, [load])
  const maxDept = data?.byDepartment.reduce((m, d) => Math.max(m, d.count), 1) ?? 1

  function handleSearch(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && query.trim()) {
      onAskAria(query.trim())
      setQuery('')
    }
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 24, background: 'var(--bg)', boxSizing: 'border-box' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <SectionTitle style={{
            margin: '0 0 2px',
            fontSize: 20,
            fontWeight: 600,
            fontFamily: 'var(--font-serif)',
            color: 'var(--ink-1)',
          }}>
            {locale === 'ar' ? 'تحليلات الموظفين' : 'People Intelligence'}
          </SectionTitle>
          <p style={{ margin: 0, fontSize: 'var(--text-caption)', color: 'var(--ink-3)' }}>
            {loading
              ? tk(locale, 'common.loading')
              : data
                ? isManager
                  ? (locale === 'ar' ? 'فريقك · اسأل آريا أي شيء عن مرؤوسيك المباشرين' : 'Your team · ask ARIA anything about your direct reports')
                  : (locale === 'ar' ? 'عدد الموظفين المباشر · اسأل آريا أي شيء عن قوتك العاملة' : 'Live headcount · ask ARIA anything about your workforce')
                : (locale === 'ar' ? 'لا توجد بيانات' : 'No data')}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          title={locale === 'ar' ? 'تحديث' : 'Refresh'}
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

      {/* KPI row */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <KPICard icon={<Users size={16} />}     label={locale === 'ar' ? 'إجمالي النشطين' : 'Total Active'}   value={data?.totalActive  ?? 0} loading={loading} />
        <KPICard icon={<UserCheck size={16} />} label={locale === 'ar' ? 'في إجازة اليوم' : 'On Leave Today'} value={data?.onLeaveToday ?? 0} loading={loading} />
        <KPICard icon={<UserPlus size={16} />}  label={locale === 'ar' ? 'جدد هذا الشهر' : 'New This Month'}  value={data?.newThisMonth ?? 0} loading={loading} />
      </div>

      {/* Dept breakdown */}
      {!loading && data && data.byDepartment.length > 0 && (
        <div style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '18px 20px',
          marginBottom: 20,
        }}>
          <p style={{
            margin: '0 0 14px',
            fontSize: 'var(--text-caption)', fontWeight: 700,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            color: 'var(--ink-3)',
            fontFamily: 'var(--font-mono, monospace)',
          }}>
            {locale === 'ar' ? 'عدد الموظفين حسب القسم' : 'Headcount by Department'}
          </p>
          {data.byDepartment.map(d => (
            <DeptBar key={d.deptName} name={d.deptName} count={d.count} max={maxDept} />
          ))}
        </div>
      )}

      {/* Dept skeleton */}
      {loading && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px', marginBottom: 20 }}>
          {[80, 65, 50, 40].map(w => (
            <div key={w} style={{ marginBottom: 12 }}>
              <div style={{ height: 12, width: `${w}%`, background: 'var(--surface)', borderRadius: 4, marginBottom: 6 }} />
              <div style={{ height: 7, background: 'var(--surface)', borderRadius: 4 }} />
            </div>
          ))}
        </div>
      )}

      {/* Suggested prompts */}
      <div style={{ marginBottom: 20 }}>
        <p style={{
          margin: '0 0 10px',
          fontSize: 'var(--text-caption)', fontWeight: 700,
          letterSpacing: '0.08em', textTransform: 'uppercase',
          color: 'var(--ink-3)',
          fontFamily: 'var(--font-mono, monospace)',
        }}>
          {locale === 'ar' ? 'أسئلة مقترحة' : 'Suggested Questions'}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(isManager
            ? (locale === 'ar' ? SUGGESTED_PROMPTS_MANAGER_AR : SUGGESTED_PROMPTS_MANAGER)
            : (locale === 'ar' ? SUGGESTED_PROMPTS_ADMIN_AR : SUGGESTED_PROMPTS_ADMIN)).map(prompt => (
            <button
              key={prompt}
              onClick={() => onAskAria(prompt)}
              style={{
                textAlign: 'left',
                padding: '9px 14px',
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                fontSize: 'var(--text-body)',
                color: 'var(--ink-2)',
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
                transition: 'border-color 0.15s ease',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      {/* Free-text search */}
      <div style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px',
      }}>
        <Search size={16} style={{ color: 'var(--ink-4)', flexShrink: 0 }} />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleSearch}
          placeholder={isManager
            ? (locale === 'ar' ? 'اسأل آريا عن فريقك…' : 'Ask ARIA about your team…')
            : (locale === 'ar' ? 'اسأل آريا عن أي موظف أو فريق…' : 'Ask ARIA about any employee or team…')}
          style={{
            flex: 1, border: 'none', outline: 'none',
            background: 'transparent',
            fontSize: 'var(--text-body)', color: 'var(--ink-1)',
            fontFamily: 'var(--font-sans)',
          }}
        />
        <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)' }}>↵</span>
      </div>

    </div>
  )
}
