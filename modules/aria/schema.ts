/**
 * aria schema re-exports — Sprint 2 skeleton.
 * ARIA has no dedicated tables in Phase 1 — it consumes the events outbox
 * and resolves intents against other modules' public APIs.
 * Re-exporting the events table keeps cross-module access via this barrel
 * consistent with Hard Rule 6.
 */
export { events } from '@/drizzle/schema'

export type { EventOutbox, NewEventOutbox } from '@/drizzle/schema'
