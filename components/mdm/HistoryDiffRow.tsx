import type { DiffLine } from '@/lib/audit-diff'

interface HistoryDiffRowProps {
  diff: DiffLine
}

export function HistoryDiffRow({ diff }: HistoryDiffRowProps) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{
        fontSize:      'var(--text-caption)',
        fontWeight:    700,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        color:         'var(--ink-3)',
        marginBottom:  3,
      }}>
        {diff.fieldLabel}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{
          fontSize:        'var(--text-caption)',
          color:           'var(--ink-3)',
          textDecoration:  'line-through',
          maxWidth:        140,
          overflow:        'hidden',
          textOverflow:    'ellipsis',
          whiteSpace:      'nowrap',
        }}>
          {diff.oldDisplay}
        </span>
        <span style={{ fontSize: 'var(--text-caption)', color: 'var(--ink-4)' }}>→</span>
        <span style={{
          fontSize:     'var(--text-caption)',
          fontWeight:   500,
          color:        'var(--ink-1)',
          maxWidth:     140,
          overflow:     'hidden',
          textOverflow: 'ellipsis',
          whiteSpace:   'nowrap',
        }}>
          {diff.newDisplay}
        </span>
      </div>
    </div>
  )
}
