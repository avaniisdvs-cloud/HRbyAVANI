/**
 * AVANIIS HR — Org Chart Snapshot Cache (Session 6)
 *
 * Stores pre-computed node/edge JSON per engine+scope so the SSR page
 * can skip the expensive recursive CTE and serve from this table instead
 * (~50 ms read vs ~800 ms cold CTE).
 *
 * The cron job (lib/jobs/org-chart-snapshot.ts) marks rows stale after
 * any structural write and recomputes them hourly.
 */

import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  timestamp,
  jsonb,
} from 'drizzle-orm/pg-core'
import { TENANT_ID } from '../../lib/constants'

export const orgHierarchySnapshots = pgTable('org_hierarchy_snapshots', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  tenantId:            uuid('tenant_id').notNull().default(TENANT_ID),
  engine:              varchar('engine', { length: 50 }).notNull(),
  scopeKey:            varchar('scope_key', { length: 200 }).notNull().default('full'),

  /** JSON arrays serialised from OrgFlowNode[] / OrgFlowEdge[] */
  nodes:               jsonb('nodes').notNull().default([]),
  edges:               jsonb('edges').notNull().default([]),
  /** OrgTreeMeta serialised as JSON */
  meta:                jsonb('meta').notNull().default({}),

  nodeCount:           integer('node_count').notNull().default(0),
  isStale:             boolean('is_stale').notNull().default(false),
  computedAt:          timestamp('computed_at', { withTimezone: true }).defaultNow().notNull(),
  recomputeStartedAt:  timestamp('recompute_started_at', { withTimezone: true }),
})
