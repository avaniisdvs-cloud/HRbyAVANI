/**
 * Org Chart Event Bus — Task G
 *
 * Minimal typed EventTarget-based bus that lets ARIA responses
 * drive canvas actions without prop-drilling.
 *
 * Server-side safe: `bus` is null on the server; all dispatch/subscribe
 * calls are no-ops in SSR context.
 */

// ── Event type registry ───────────────────────────────────────────────────────

export type ChartEventType =
  | 'PAN_TO_NODE'
  | 'FILTER_VACANT'
  | 'FILTER_DEPT'
  | 'RELOAD_FULL'
  | 'RELOAD_MY_TEAM'
  | 'HIGHLIGHT_NODES'

export interface ChartEventPayload {
  PAN_TO_NODE:     { nodeId: string }
  FILTER_VACANT:   { minDays?: number }
  FILTER_DEPT:     { deptId: string; deptName: string }
  RELOAD_FULL:     Record<string, never>
  RELOAD_MY_TEAM:  Record<string, never>
  HIGHLIGHT_NODES: { nodeIds: string[]; reason: string }
}

// ── Singleton bus (client only) ───────────────────────────────────────────────

const bus: EventTarget | null =
  typeof window !== 'undefined' ? new EventTarget() : null

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fire a typed chart event. No-op on the server.
 */
export function dispatchChartEvent<T extends ChartEventType>(
  type:    T,
  payload: ChartEventPayload[T],
): void {
  bus?.dispatchEvent(new CustomEvent(type, { detail: payload }))
}

/**
 * Subscribe to a typed chart event.
 * Returns an unsubscribe function — call it in a useEffect cleanup.
 * No-op on the server (returns a no-op unsubscribe).
 */
export function onChartEvent<T extends ChartEventType>(
  type:    T,
  handler: (payload: ChartEventPayload[T]) => void,
): () => void {
  if (!bus) return () => {}
  const listener = (e: Event) => handler((e as CustomEvent<ChartEventPayload[T]>).detail)
  bus.addEventListener(type, listener)
  return () => bus.removeEventListener(type, listener)
}
