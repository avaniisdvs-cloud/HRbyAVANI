'use client'

/**
 * OrgChartAriaPanel
 *
 * Fixed right-side overlay panel — same pattern as OrgChartFilters and
 * OrgChartAnalytics. Slides in from the right over the canvas without
 * affecting the sidebar or pushing/shrinking the canvas.
 *
 * z-index 40 (below OrgChartShell topbar at z=50 and above canvas at z=0)
 */

import { useState, useRef, useEffect }    from 'react'
import { X, Send, Bot }                   from 'lucide-react'
import { useLocale }                      from '@/components/providers/LocaleProvider'
import { resolveOrgChartIntent }          from '@/modules/aria/intents/org-chart-intents'
import { dispatchChartEvent }             from '@/lib/org-chart/chart-events'
import type { OrgFlowNode }               from '@/lib/org-chart/types'
import type { ChartEventType, ChartEventPayload } from '@/lib/org-chart/chart-events'

interface OrgChartAriaPanelProps {
  isOpen:    boolean
  onClose:   () => void
  viewerRole:string
  orgContext: {
    totalPositions:  number
    vacantCount:     number
    occupiedCount:   number
    deptNames:       string[]
    currentPersonId?: string
  }
  nodes:       OrgFlowNode[]
  departments: Array<{ id: string; nameEn: string }>
}

interface ChatMessage {
  role:    'user' | 'assistant'
  content: string
}

const SUGGESTED_EN = [
  'Who reports to the CEO?',
  'Show vacant positions',
  'Show the full company',
  'Any pending hiring requests?',
]

const SUGGESTED_AR = [
  'من يتبع للرئيس التنفيذي؟',
  'إظهار الوظائف الشاغرة',
  'إظهار المؤسسة بالكامل',
  'هل هناك طلبات توظيف معلّقة؟',
]

function parseAriaResponse(text: string): { clean: string; action?: Record<string, unknown> } {
  const match = text.match(/```action\n?([\s\S]*?)\n?```/)
  if (match) {
    try {
      const action = JSON.parse(match[1]) as Record<string, unknown>
      const clean  = text.replace(/```action[\s\S]*?```/g, '').trim()
      return { clean, action }
    } catch {}
  }
  return { clean: text.trim() }
}

function applyAction(action: Record<string, unknown>) {
  const type = action.action as ChartEventType
  if (!type) return
  try {
    dispatchChartEvent(type, action as unknown as ChartEventPayload[ChartEventType])
  } catch {}
}

export function OrgChartAriaPanel({
  isOpen,
  onClose,
  viewerRole: _role,
  orgContext,
  nodes,
  departments,
}: OrgChartAriaPanelProps) {
  const locale   = useLocale()
  const isAr     = locale === 'ar'
  const SUGGESTED = isAr ? SUGGESTED_AR : SUGGESTED_EN

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input,    setInput]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const bottomRef  = useRef<HTMLDivElement>(null)
  const inputRef   = useRef<HTMLInputElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 50)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  async function handleSend(text: string) {
    const query = (text || input).trim()
    if (!query || loading) return

    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: query }])
    setLoading(true)

    try {
      const localResult = await resolveOrgChartIntent({ query, nodes, departments })

      if (localResult?.matched) {
        setMessages(prev => [...prev, { role: 'assistant', content: localResult.text }])
        return
      }

      const systemPrompt = [
        'You are ARIA, the AVANIIS HR Organisation Chart assistant.',
        'You help users navigate and understand the organisation structure.',
        `Current chart context:`,
        `  Total positions: ${orgContext.totalPositions}`,
        `  Occupied: ${orgContext.occupiedCount}, Vacant: ${orgContext.vacantCount}`,
        `  Departments: ${orgContext.deptNames.slice(0, 10).join(', ')}`,
        '',
        'You can perform actions by including a JSON action block:',
        '  {"action":"PAN_TO_NODE","nodeId":"<uuid>"}',
        '  {"action":"FILTER_VACANT"}',
        '  {"action":"FILTER_DEPT","deptId":"<uuid>","deptName":"<name>"}',
        '  {"action":"RELOAD_FULL"}',
        '  {"action":"HIGHLIGHT_NODES","nodeIds":["<uuid>"]}',
        '',
        'Always respond in the same language the user wrote in.',
        'Keep responses concise (2–3 sentences max).',
        'Never reveal salary data, confidential positions, or personal IDs.',
        'If you include an action JSON block, wrap it in ```action``` fences.',
      ].join('\n')

      const res = await fetch('/api/aria/org-chart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, systemPrompt }),
      })

      if (!res.ok) throw new Error(`API error ${res.status}`)

      const data = await res.json() as { text?: string; error?: string }
      const raw  = data.text ?? (isAr
        ? 'لست متأكدًا من ذلك. جرّب السؤال عن الهيكل التنظيمي أو الوظائف الشاغرة أو تقارير الفِرق.'
        : "I'm not sure about that. Try asking about the org structure, vacancies, or team reports.")
      const { clean, action } = parseAriaResponse(raw)
      if (action) applyAction(action)
      setMessages(prev => [...prev, { role: 'assistant', content: clean }])
    } catch {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: isAr
          ? 'عذرًا، تعذّرت معالجة ذلك. جرّب السؤال عن الوظائف الشاغرة أو أعداد الموظفين أو الطلبات المعلّقة.'
          : "Sorry, I couldn't process that. Try asking about vacancies, headcount, or pending requests." },
      ])
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend(input)
    }
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop — click outside to close, sits over canvas only */}
      <div
        onClick={onClose}
        style={{
          position:   'fixed',
          top:        56,
          left:       0,
          right:      360,
          bottom:     0,
          background: 'rgba(0,0,0,0.12)',
          zIndex:     39,
        }}
      />

      {/* Panel — fixed right overlay, same geometry as Filters / Analytics */}
      <div style={{
        position:      'fixed',
        top:           56,
        right:         0,
        width:         360,
        height:        'calc(100vh - 56px)',
        display:       'flex',
        flexDirection: 'column',
        background:    'var(--card)',
        borderLeft:    '1px solid var(--border)',
        boxShadow:     '-4px 0 20px rgba(0,0,0,0.10)',
        zIndex:        40,
        overflow:      'hidden',
      }}>

        {/* Header */}
        <div style={{
          height:         48,
          minHeight:      48,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          padding:        '0 14px',
          borderBottom:   '1px solid var(--border)',
          background:     'var(--accent)',
          flexShrink:     0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Bot size={16} style={{ color: 'white' }} />
            <span style={{ fontSize: 'var(--text-body)', fontWeight: 600, fontFamily: 'var(--font-sans)', color: 'white' }}>
              {isAr ? 'آريا — الهيكل التنظيمي' : 'ARIA — Org Chart'}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.85)', padding: 4, display: 'flex', alignItems: 'center', borderRadius: 4 }}
            aria-label={isAr ? 'إغلاق لوحة آريا' : 'Close ARIA panel'}
          >
            <X size={15} strokeWidth={2} />
          </button>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: 8 }}>

          {messages.length === 0 && !loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-3)', fontFamily: 'var(--font-sans)', textAlign: 'center', marginBottom: 4 }}>
                {isAr ? 'اسألني عن الهيكل التنظيمي' : 'Ask me about the org chart'}
              </div>
              {SUGGESTED.map(s => (
                <button
                  key={s}
                  onClick={() => void handleSend(s)}
                  style={{
                    padding:      '7px 12px',
                    borderRadius: 20,
                    border:       '1px solid var(--border)',
                    background:   'var(--surface)',
                    color:        'var(--ink-2)',
                    fontSize:     'var(--text-caption)',
                    fontFamily:   'var(--font-sans)',
                    cursor:       'pointer',
                    textAlign:    'left',
                    transition:   'background 0.12s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent-100)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface)' }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              style={{
                alignSelf:    msg.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth:     '85%',
                background:   msg.role === 'user' ? 'var(--accent-100)' : 'var(--surface)',
                color:        'var(--ink-1)',
                borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                padding:      '8px 12px',
                fontSize:     'var(--text-body)',
                fontFamily:   'var(--font-sans)',
                lineHeight:   1.5,
                whiteSpace:   'pre-wrap',
              }}
            >
              {msg.content}
            </div>
          ))}

          {loading && (
            <div style={{ alignSelf: 'flex-start', display: 'flex', gap: 4, padding: '10px 12px', background: 'var(--surface)', borderRadius: '12px 12px 12px 2px' }}>
              {[0, 150, 300].map(delay => (
                <span
                  key={delay}
                  style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: 'var(--ink-3)',
                    display: 'inline-block',
                    animation: `ariaPulse 1.2s ease-in-out ${delay}ms infinite`,
                  }}
                />
              ))}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input row */}
        <div style={{
          display:    'flex',
          alignItems: 'center',
          borderTop:  '1px solid var(--border)',
          background: 'var(--card)',
          flexShrink: 0,
        }}>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isAr ? 'اسأل عن الهيكل التنظيمي…' : 'Ask about the org chart…'}
            disabled={loading}
            style={{
              flex:       1,
              border:     'none',
              outline:    'none',
              background: 'transparent',
              fontSize:   'var(--text-body)',
              fontFamily: 'var(--font-sans)',
              color:      'var(--ink-1)',
              padding:    '10px 12px',
            }}
          />
          <button
            onClick={() => void handleSend(input)}
            disabled={loading || !input.trim()}
            style={{
              width:          36,
              height:         36,
              marginRight:    6,
              borderRadius:   8,
              border:         'none',
              background:     (loading || !input.trim()) ? 'var(--border)' : 'var(--accent)',
              color:          'white',
              cursor:         (loading || !input.trim()) ? 'not-allowed' : 'pointer',
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              flexShrink:     0,
              transition:     'background 0.15s',
            }}
            aria-label={isAr ? 'إرسال' : 'Send'}
          >
            <Send size={14} strokeWidth={2} />
          </button>
        </div>

        <style>{`
          @keyframes ariaPulse {
            0%, 100% { opacity: 0.3; transform: scale(0.8); }
            50% { opacity: 1; transform: scale(1); }
          }
        `}</style>
      </div>
    </>
  )
}
