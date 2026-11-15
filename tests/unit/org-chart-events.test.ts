/**
 * Unit tests — lib/org-chart/chart-events.ts
 *
 * Tests the typed EventTarget event bus that ARIA uses to drive canvas
 * actions without prop-drilling. All tests run in jsdom where
 * `typeof window !== 'undefined'` so the bus is a real EventTarget.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { dispatchChartEvent, onChartEvent } from '@/lib/org-chart/chart-events'

// ── helpers ───────────────────────────────────────────────────────────────────

/** Collect every payload fired for a given event type and return an unsub fn. */
function capture<T extends Parameters<typeof onChartEvent>[0]>(
  type: T,
  out: ReturnType<Parameters<typeof onChartEvent<T>>[1]>[],
) {
  return onChartEvent(type as never, (p: unknown) => out.push(p as never))
}

// ── PAN_TO_NODE ───────────────────────────────────────────────────────────────

describe('PAN_TO_NODE', () => {
  it('delivers nodeId to subscriber', () => {
    const received: { nodeId: string }[] = []
    const unsub = onChartEvent('PAN_TO_NODE', p => received.push(p))

    dispatchChartEvent('PAN_TO_NODE', { nodeId: 'node-ceo-01' })
    unsub()

    expect(received).toHaveLength(1)
    expect(received[0]).toEqual({ nodeId: 'node-ceo-01' })
  })

  it('delivers separate events independently', () => {
    const ids: string[] = []
    const unsub = onChartEvent('PAN_TO_NODE', ({ nodeId }) => ids.push(nodeId))

    dispatchChartEvent('PAN_TO_NODE', { nodeId: 'n1' })
    dispatchChartEvent('PAN_TO_NODE', { nodeId: 'n2' })
    dispatchChartEvent('PAN_TO_NODE', { nodeId: 'n3' })
    unsub()

    expect(ids).toEqual(['n1', 'n2', 'n3'])
  })
})

// ── FILTER_VACANT ─────────────────────────────────────────────────────────────

describe('FILTER_VACANT', () => {
  it('delivers empty payload when no minDays supplied', () => {
    let captured: unknown = 'unset'
    const unsub = onChartEvent('FILTER_VACANT', p => { captured = p })

    dispatchChartEvent('FILTER_VACANT', {})
    unsub()

    expect(captured).toEqual({})
  })

  it('delivers minDays when supplied', () => {
    const captured: { minDays?: number }[] = []
    const unsub = onChartEvent('FILTER_VACANT', p => captured.push(p))

    dispatchChartEvent('FILTER_VACANT', { minDays: 60 })
    unsub()

    expect(captured[0]?.minDays).toBe(60)
  })
})

// ── FILTER_DEPT ───────────────────────────────────────────────────────────────

describe('FILTER_DEPT', () => {
  it('delivers deptId and deptName', () => {
    let captured: { deptId: string; deptName: string } | null = null
    const unsub = onChartEvent('FILTER_DEPT', p => { captured = p })

    dispatchChartEvent('FILTER_DEPT', { deptId: 'dept-fin', deptName: 'Finance' })
    unsub()

    expect(captured).toEqual({ deptId: 'dept-fin', deptName: 'Finance' })
  })

  it('handles Arabic dept names correctly', () => {
    const captured: { deptId: string; deptName: string }[] = []
    const unsub = onChartEvent('FILTER_DEPT', p => captured.push(p))

    dispatchChartEvent('FILTER_DEPT', { deptId: 'dept-ar', deptName: 'الموارد البشرية' })
    unsub()

    expect(captured[0]?.deptName).toBe('الموارد البشرية')
  })
})

// ── HIGHLIGHT_NODES ───────────────────────────────────────────────────────────

describe('HIGHLIGHT_NODES', () => {
  it('delivers nodeIds array and reason', () => {
    const captured: { nodeIds: string[]; reason: string }[] = []
    const unsub = onChartEvent('HIGHLIGHT_NODES', p => captured.push(p))

    dispatchChartEvent('HIGHLIGHT_NODES', { nodeIds: ['n-a', 'n-b', 'n-c'], reason: 'Direct reports of CEO' })
    unsub()

    expect(captured[0]?.nodeIds).toEqual(['n-a', 'n-b', 'n-c'])
    expect(captured[0]?.reason).toBe('Direct reports of CEO')
  })

  it('delivers empty nodeIds array without error', () => {
    const captured: { nodeIds: string[]; reason: string }[] = []
    const unsub = onChartEvent('HIGHLIGHT_NODES', p => captured.push(p))

    dispatchChartEvent('HIGHLIGHT_NODES', { nodeIds: [], reason: 'none' })
    unsub()

    expect(captured[0]?.nodeIds).toEqual([])
  })
})

// ── RELOAD_FULL / RELOAD_MY_TEAM ─────────────────────────────────────────────

describe('RELOAD_FULL', () => {
  it('fires the listener with empty payload', () => {
    let fired = false
    const unsub = onChartEvent('RELOAD_FULL', () => { fired = true })

    dispatchChartEvent('RELOAD_FULL', {} as Record<string, never>)
    unsub()

    expect(fired).toBe(true)
  })
})

describe('RELOAD_MY_TEAM', () => {
  it('fires the listener with empty payload', () => {
    let fired = false
    const unsub = onChartEvent('RELOAD_MY_TEAM', () => { fired = true })

    dispatchChartEvent('RELOAD_MY_TEAM', {} as Record<string, never>)
    unsub()

    expect(fired).toBe(true)
  })
})

// ── Unsubscribe ───────────────────────────────────────────────────────────────

describe('onChartEvent unsubscribe', () => {
  it('stops delivery after unsub() is called', () => {
    const received: string[] = []
    const unsub = onChartEvent('PAN_TO_NODE', ({ nodeId }) => received.push(nodeId))

    dispatchChartEvent('PAN_TO_NODE', { nodeId: 'before' })
    unsub()
    dispatchChartEvent('PAN_TO_NODE', { nodeId: 'after' })

    expect(received).toEqual(['before'])
    expect(received).not.toContain('after')
  })

  it('second unsub() call is a no-op (no throw)', () => {
    const unsub = onChartEvent('PAN_TO_NODE', () => {})
    unsub()
    expect(() => unsub()).not.toThrow()
  })
})

// ── Multiple listeners ────────────────────────────────────────────────────────

describe('multiple listeners', () => {
  it('all listeners for the same event type receive the payload', () => {
    const a: string[] = []
    const b: string[] = []
    const c: string[] = []

    const unsubA = onChartEvent('PAN_TO_NODE', ({ nodeId }) => a.push(nodeId))
    const unsubB = onChartEvent('PAN_TO_NODE', ({ nodeId }) => b.push(nodeId))
    const unsubC = onChartEvent('PAN_TO_NODE', ({ nodeId }) => c.push(nodeId))

    dispatchChartEvent('PAN_TO_NODE', { nodeId: 'multi' })

    unsubA(); unsubB(); unsubC()

    expect(a).toEqual(['multi'])
    expect(b).toEqual(['multi'])
    expect(c).toEqual(['multi'])
  })

  it('unsubbing one listener does not affect others', () => {
    const a: string[] = []
    const b: string[] = []

    const unsubA = onChartEvent('PAN_TO_NODE', ({ nodeId }) => a.push(nodeId))
    const unsubB = onChartEvent('PAN_TO_NODE', ({ nodeId }) => b.push(nodeId))

    dispatchChartEvent('PAN_TO_NODE', { nodeId: 'first' })
    unsubA()
    dispatchChartEvent('PAN_TO_NODE', { nodeId: 'second' })
    unsubB()

    expect(a).toEqual(['first'])
    expect(b).toEqual(['first', 'second'])
  })
})

// ── Cross-type isolation ──────────────────────────────────────────────────────

describe('cross-type isolation', () => {
  it('FILTER_DEPT listener does not fire on PAN_TO_NODE event', () => {
    const deptEvents: unknown[] = []
    const unsub = onChartEvent('FILTER_DEPT', p => deptEvents.push(p))

    dispatchChartEvent('PAN_TO_NODE', { nodeId: 'wrong-type' })
    unsub()

    expect(deptEvents).toHaveLength(0)
  })

  it('HIGHLIGHT_NODES listener does not fire on FILTER_VACANT event', () => {
    const highlights: unknown[] = []
    const unsub = onChartEvent('HIGHLIGHT_NODES', p => highlights.push(p))

    dispatchChartEvent('FILTER_VACANT', { minDays: 30 })
    unsub()

    expect(highlights).toHaveLength(0)
  })

  it('different event types do not interfere with each other', () => {
    const panFired: boolean[] = []
    const filterFired: boolean[] = []

    const u1 = onChartEvent('PAN_TO_NODE',   () => panFired.push(true))
    const u2 = onChartEvent('FILTER_VACANT', () => filterFired.push(true))

    dispatchChartEvent('PAN_TO_NODE',   { nodeId: 'x' })
    dispatchChartEvent('FILTER_VACANT', {})

    u1(); u2()

    expect(panFired).toHaveLength(1)
    expect(filterFired).toHaveLength(1)
  })
})
