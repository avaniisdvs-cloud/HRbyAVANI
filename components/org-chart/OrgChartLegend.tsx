'use client'

import { useState } from 'react'
import { Panel }    from '@xyflow/react'
import { useLocale } from '@/components/providers/LocaleProvider'

interface LegendItem {
  type:    'dot' | 'dashed'
  color:   string
  labelEn: string
  labelAr: string
}

const ITEMS: LegendItem[] = [
  { type: 'dot',    color: 'var(--brand-active)',          labelEn: 'Active Employee',       labelAr: 'موظف نشط' },
  { type: 'dot',    color: 'var(--org-acting)',       labelEn: 'Acting Assignment',     labelAr: 'تكليف بالإنابة' },
  { type: 'dot',    color: 'var(--org-contractor)',   labelEn: 'Contractor',            labelAr: 'متعاقد' },
  { type: 'dot',    color: 'var(--org-vacant)',       labelEn: 'Vacant Position',       labelAr: 'وظيفة شاغرة' },
  { type: 'dot',    color: 'var(--org-frozen)',       labelEn: 'Frozen (Budget Hold)',  labelAr: 'مجمَّدة (تعليق ميزانية)' },
  { type: 'dashed', color: 'var(--ink-4)',            labelEn: 'Dotted-line Reporting', labelAr: 'تبعية بخط متقطع' },
]

export function OrgChartLegend() {
  const [open, setOpen] = useState(false)
  const isAr = useLocale() === 'ar'

  return (
    <Panel position="bottom-left">
      {open ? (
        <div style={{
          background:   'var(--card)',
          border:       '1px solid var(--border)',
          borderRadius: 8,
          padding:      10,
          boxShadow:    '0 2px 8px rgba(0,0,0,0.07)',
          minWidth:     170,
        }}>
          <div style={{
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'space-between',
            marginBottom:   8,
          }}>
            <span style={{
              fontSize:   'var(--text-caption)',
              fontWeight: 600,
              color:      'var(--ink-2)',
              fontFamily: 'var(--font-sans)',
              letterSpacing: '0.04em',
            }}>
              {isAr ? 'وسيلة الإيضاح' : 'LEGEND'}
            </span>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: 'none',
                border:     'none',
                cursor:     'pointer',
                fontSize:   'var(--text-caption)',
                color:      'var(--ink-3)',
                padding:    0,
                fontFamily: 'var(--font-sans)',
              }}
              aria-label={isAr ? 'طي وسيلة الإيضاح' : 'Collapse legend'}
            >
              ▾
            </button>
          </div>

          {ITEMS.map(item => (
            <div key={item.labelEn} style={{
              display:    'flex',
              alignItems: 'center',
              gap:        8,
              marginBottom: 5,
            }}>
              {item.type === 'dot' ? (
                <span style={{
                  width:        10,
                  height:       10,
                  borderRadius: '50%',
                  background:   item.color,
                  flexShrink:   0,
                  display:      'inline-block',
                }} />
              ) : (
                <span style={{
                  width:        24,
                  height:       0,
                  borderTop:    `1.5px dashed ${item.color}`,
                  flexShrink:   0,
                  display:      'inline-block',
                }} />
              )}
              <span style={{
                fontSize:   'var(--text-caption)',
                color:      'var(--ink-2)',
                fontFamily: 'var(--font-sans)',
              }}>
                {isAr ? item.labelAr : item.labelEn}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          style={{
            height:       26,
            padding:      '0 8px',
            borderRadius: 6,
            fontSize:     'var(--text-caption)',
            fontFamily:   'var(--font-sans)',
            color:        'var(--ink-3)',
            background:   'var(--card)',
            border:       '1px solid var(--border)',
            cursor:       'pointer',
          }}
        >
          {isAr ? 'وسيلة الإيضاح ▾' : 'Legend ▾'}
        </button>
      )}
    </Panel>
  )
}
