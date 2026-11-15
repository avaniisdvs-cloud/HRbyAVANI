import type { CSSProperties } from 'react'

/**
 * Solid edge — solid reporting line (manager → direct report).
 * Uses a mid-tone slate colour that is clearly visible on both
 * light and dark backgrounds and never blends with var(--border).
 */
export const solidEdgeStyle: CSSProperties = {
  stroke:      '#1e3a5f',   /* dark navy — clear hierarchy line on all themes */
  strokeWidth: 2,
}

/**
 * Dotted edge — matrix / dotted-line reporting relationship.
 * Lighter navy so it is visually related but clearly distinct from solid lines.
 */
export const dottedEdgeStyle: CSSProperties = {
  stroke:          '#3b6ea8',   /* medium navy-blue — distinct from solid dark navy */
  strokeWidth:     1.75,
  strokeDasharray: '6 4',
}
