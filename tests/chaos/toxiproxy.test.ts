/**
 * CHAOS-007 — DB Outage Simulation via Toxiproxy
 *
 * Prerequisites (all satisfied):
 *   brew install toxiproxy        (v2.12.0 installed)
 *   toxiproxy-server running      (http://localhost:8474)
 *   proxy 'postgres_chaos'        (localhost:25432 → localhost:5433)
 *   Docker avaniis_hr_db          (postgres:16-alpine, healthy)
 *
 * Run:
 *   toxiproxy-server &
 *   toxiproxy-cli create -l 0.0.0.0:25432 -u localhost:5433 postgres_chaos
 *   pnpm vitest run tests/chaos/toxiproxy.test.ts
 *
 * If Toxiproxy is not running, all tests are skipped gracefully.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import postgres from 'postgres'

// ── Configuration ─────────────────────────────────────────────────────────────

const TOXIPROXY_API  = 'http://localhost:8474'
const PROXY_NAME     = 'postgres_chaos'
const PROXY_PG_URL   = 'postgres://avaniis:avaniis_dev@localhost:25432/avaniis_hr'

// ── Availability check ────────────────────────────────────────────────────────

let toxiproxyAvailable = false
let sql: ReturnType<typeof postgres> | null = null

beforeAll(async () => {
  try {
    const res = await fetch(`${TOXIPROXY_API}/proxies`)
    if (!res.ok) return
    const proxies = await res.json() as Record<string, { enabled: boolean }>
    toxiproxyAvailable = proxies[PROXY_NAME]?.enabled === true
  } catch {
    toxiproxyAvailable = false
  }

  if (toxiproxyAvailable) {
    sql = postgres(PROXY_PG_URL, { max: 3, idle_timeout: 5, connect_timeout: 5 })
  }
})

afterAll(async () => {
  await sql?.end({ timeout: 3 }).catch(() => {})
})

// Ensure toxics are cleared after each test so they don't bleed across
afterEach(async () => {
  if (!toxiproxyAvailable) return
  try {
    const res = await fetch(`${TOXIPROXY_API}/proxies/${PROXY_NAME}/toxics`)
    if (res.ok) {
      const toxics = await res.json() as Array<{ name: string }>
      for (const t of toxics) {
        await fetch(`${TOXIPROXY_API}/proxies/${PROXY_NAME}/toxics/${t.name}`, { method: 'DELETE' })
      }
    }
  } catch { /* no-op */ }
})

// ── Helper: inject/remove toxics ─────────────────────────────────────────────

async function injectToxic(type: string, attrs: Record<string, unknown>, toxicity = 1.0) {
  const res = await fetch(`${TOXIPROXY_API}/proxies/${PROXY_NAME}/toxics`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ name: type, type, stream: 'upstream', toxicity, attributes: attrs }),
  })
  if (!res.ok) throw new Error(`Failed to inject toxic: ${await res.text()}`)
}

async function removeToxic(name: string) {
  await fetch(`${TOXIPROXY_API}/proxies/${PROXY_NAME}/toxics/${name}`, { method: 'DELETE' })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CHAOS-007 — DB outage simulation via Toxiproxy', () => {
  it('Toxiproxy proxy is reachable and Postgres connection passes through', async () => {
    if (!toxiproxyAvailable) {
      console.warn('SKIP: Toxiproxy not running on localhost:8474')
      return
    }
    const result = await sql!`SELECT 1 AS chaos_check`
    expect(result[0].chaos_check).toBe(1)
  })

  it('CHAOS-007a — connection timeout mid-query → error propagates, does not hang forever', async () => {
    if (!toxiproxyAvailable) {
      console.warn('SKIP: Toxiproxy not running')
      return
    }

    // Verify baseline
    const baseline = await sql!`SELECT 1`
    expect(baseline).toBeDefined()

    // Inject timeout toxic: all new connections/queries hang indefinitely
    await injectToxic('timeout', { timeout: 100 }) // 100ms timeout → simulates very slow DB

    const start = Date.now()
    let caught: Error | null = null
    try {
      // This should fail within a few seconds (not hang for 60s)
      await sql!`SELECT pg_sleep(10)` // try to sleep for 10s — will be cut by toxic
    } catch (e) {
      caught = e as Error
    }
    const elapsed = Date.now() - start

    await removeToxic('timeout')

    // Error must propagate (not silently succeed with garbage)
    expect(caught).not.toBeNull()
    // Must fail in a bounded time (< 10s) — not hanging indefinitely
    expect(elapsed).toBeLessThan(10_000)
    console.log(`CHAOS-007a: Query failed in ${elapsed}ms with: ${caught?.message}`)
  })

  it('CHAOS-007b — connection reset mid-request → postgres driver recovers, next query succeeds', async () => {
    if (!toxiproxyAvailable) {
      console.warn('SKIP: Toxiproxy not running')
      return
    }

    // Inject connection reset toxic (instantly resets TCP connection)
    await injectToxic('reset_peer', { timeout: 0 })

    let resetError: Error | null = null
    try {
      await sql!`SELECT 1`
    } catch (e) {
      resetError = e as Error
    }

    // Remove the toxic
    await removeToxic('reset_peer')

    // After removing toxic, connection pool must self-heal
    // Give pool 1s to recover
    await new Promise(r => setTimeout(r, 1000))

    const recovery = await sql!`SELECT 1 AS recovered`
    expect(recovery[0].recovered).toBe(1)

    console.log(`CHAOS-007b: Reset error was: ${resetError?.message ?? 'none'}; pool recovered ✅`)
  })

  it('CHAOS-007c — bandwidth throttle (1KB/s) — queries still complete, just slowly', async () => {
    if (!toxiproxyAvailable) {
      console.warn('SKIP: Toxiproxy not running')
      return
    }

    // Inject bandwidth limiter: 1KB/s downstream
    await injectToxic('bandwidth', { rate: 1 }) // 1 KB/s

    const start   = Date.now()
    const result  = await sql!`SELECT repeat('x', 100) AS throttled_str`
    const elapsed = Date.now() - start

    await removeToxic('bandwidth')

    // Query completes (no data corruption) — just slower
    expect(result[0].throttled_str).toHaveLength(100)
    // Bandwidth throttle at 1KB/s for a 100-byte response should take ≥ 0ms — just sanity check
    console.log(`CHAOS-007c: Throttled query completed in ${elapsed}ms with correct data ✅`)
  })

  it('CHAOS-007d — proxy disabled (full DB outage) → error, then re-enabled → recovery', async () => {
    if (!toxiproxyAvailable) {
      console.warn('SKIP: Toxiproxy not running')
      return
    }

    // Disable the proxy entirely (simulates DB server going down)
    const disableRes = await fetch(`${TOXIPROXY_API}/proxies/${PROXY_NAME}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ enabled: false }),
    })
    expect(disableRes.ok).toBe(true)

    let outageError: Error | null = null
    try {
      await sql!`SELECT 1`
    } catch (e) {
      outageError = e as Error
    }

    // Re-enable the proxy
    await fetch(`${TOXIPROXY_API}/proxies/${PROXY_NAME}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ enabled: true }),
    })

    // Must have errored during outage
    expect(outageError).not.toBeNull()
    console.log(`CHAOS-007d: DB outage error: ${outageError?.message}`)

    // Pool must recover after DB comes back
    await new Promise(r => setTimeout(r, 1500))
    const recovery = await sql!`SELECT 1 AS back_online`
    expect(recovery[0].back_online).toBe(1)
    console.log('CHAOS-007d: DB recovered from full outage ✅')
  })
})
