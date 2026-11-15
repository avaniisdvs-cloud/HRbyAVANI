interface BarChartItem {
  label: string
  value: number
}

interface CSSBarChartProps {
  items: BarChartItem[]
  color?: string
  maxItems?: number
  showValues?: boolean
}

export default function CSSBarChart({
  items,
  color = 'var(--accent)',
  maxItems,
  showValues = true,
}: CSSBarChartProps) {
  const sorted = [...items].sort((a, b) => b.value - a.value)
  const visible = maxItems ? sorted.slice(0, maxItems) : sorted
  const maxValue = visible.length > 0 ? visible[0].value : 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {visible.map((item) => {
        const widthPct = maxValue === 0 ? 0 : Math.round((item.value / maxValue) * 100)

        return (
          <div
            key={item.label}
            style={{ display: 'flex', alignItems: 'center', gap: 10 }}
          >
            {/* Label */}
            <span
              style={{
                width: 120,
                flexShrink: 0,
                fontSize: 'var(--text-caption)',
                color: 'var(--ink-2)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={item.label}
            >
              {item.label}
            </span>

            {/* Bar track */}
            <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--border)' }}>
              <div
                style={{
                  width: `${widthPct}%`,
                  height: '100%',
                  borderRadius: 4,
                  background: `linear-gradient(to right, ${color}, color-mix(in srgb, ${color} 80%, transparent))`,
                }}
              />
            </div>

            {/* Value */}
            {showValues && (
              <span
                style={{
                  flexShrink: 0,
                  fontSize: 'var(--text-caption)',
                  color: 'var(--ink-3)',
                  minWidth: 28,
                  textAlign: 'right',
                }}
              >
                {item.value}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
