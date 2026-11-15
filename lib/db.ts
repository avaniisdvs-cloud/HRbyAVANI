import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '@/drizzle/schema'

declare global {
  // eslint-disable-next-line no-var
  var _avaniisDb: ReturnType<typeof drizzle> | undefined
}

function createDb() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')

  const isProduction = process.env.NODE_ENV === 'production'

  // Serverless-safe connection config (Vercel + Neon).
  //
  // ⚠️ REQUIRES the Neon POOLED endpoint (host contains "-pooler"). DATABASE_URL
  //    in Vercel must point at the pooled connection string. With the pooled
  //    (pgBouncer transaction-mode) endpoint:
  //   - prepare: false — MANDATORY. pgBouncer transaction pooling does not keep
  //     a stable session, so server-side prepared statements (postgres.js default)
  //     fail with "prepared statement does not exist". Disabling them is required.
  //   - max: 5 — pgBouncer multiplexes many client connections over few Postgres
  //     backends, so a small per-instance pool no longer risks Neon exhaustion.
  //     This removes the max:1 single-connection starvation that hung leave submit
  //     (a transaction holding the one connection blocked every concurrent request
  //     until Vercel killed the function — observed as status 0 / "Saving…" forever).
  //   - ssl: 'require' — Neon mandates TLS.
  //   - idle_timeout: 20s — release idle connections quickly in serverless.
  //   - connect_timeout: 10s — fail fast rather than hanging if Neon is slow.
  //   - max_lifetime: 1800s — recycle connections every 30 min to prevent stale state.
  //
  // In development, keep the default pool for performance.
  const client = postgres(url, isProduction ? {
    max:           5,
    ssl:           'require',
    idle_timeout:  20,
    connect_timeout: 10,
    max_lifetime:  1800,
    prepare:       false,
  } : {})

  return drizzle(client, { schema })
}

// Reuse connection across hot reloads in development.
// In production (Vercel serverless), globalThis is per-instance — caching here
// reuses the single connection within a warm lambda invocation.
export const db = globalThis._avaniisDb ?? createDb()
if (process.env.NODE_ENV !== 'production') globalThis._avaniisDb = db

export type DB = typeof db

/**
 * Union of the bare DB instance and a Drizzle transaction object.
 * Both expose the same .insert/.update/.select/.execute/.delete API.
 * Used by functions that accept an optional caller-supplied transaction
 * (e.g. dispatchResourceCompletion, submitWorkflow with tx param).
 */
export type Tx    = Parameters<DB['transaction']>[0] extends (tx: infer T) => unknown ? T : never
export type DbOrTx = DB | Tx
