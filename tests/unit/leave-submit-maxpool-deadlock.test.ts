/**
 * Regression — MANAGER (and all) leave submit hang ("Saving…" forever).
 *
 * ROOT CAUSE: the production DB pool is max:1 (lib/db.ts). A read issued on the
 * GLOBAL `db` pool from INSIDE an open db.transaction() can never get a
 * connection (the transaction holds the only one) → the request deadlocks until
 * the serverless function is killed, and no leave row is created.
 *
 * Two paths were affected:
 *   • createLeaveRequest ("Save as DRAFT")  → getSickLeaveCertThreshold → getPolicy
 *   • submitLeaveRequest ("Save & submit")  → submitWorkflow pre-flight reads +
 *                                              loadPersonContext
 *
 * FIX: thread the active transaction into those reads (optional executor param,
 * defaulting to the global `db` so non-transactional callers are unchanged).
 *
 * These source-inspection tests guarantee the transaction is threaded through —
 * if anyone reverts a read to the global pool inside the transaction, this fails.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8')

describe('createLeaveRequest — no global-pool read inside the transaction', () => {
  const ACTIONS = read('modules/absence/actions.ts')

  it('passes the transaction (tx) into getSickLeaveCertThreshold', () => {
    expect(ACTIONS).toMatch(/getSickLeaveCertThreshold\(\s*person\.legalEntityId\s*,\s*tx\b/)
  })

  it('getSickLeaveCertThreshold accepts an executor and forwards it to getPolicy', () => {
    const CERT = read('lib/absence-cert-policy.ts')
    expect(CERT).toMatch(/executor\??:\s*DbOrTx/)
    expect(CERT).toMatch(/getPolicy\(\s*SETTING_KEY\s*,\s*entityId\s*,\s*undefined\s*,\s*executor\s*\)/)
  })

  it('getPolicy reads via the supplied executor (not a hardcoded global db)', () => {
    const CFG = read('lib/config-resolver.ts')
    expect(CFG).toMatch(/executor:\s*DbOrTx\s*=\s*db/)
    expect(CFG).toMatch(/const rows = await executor/)
  })
})

describe('submitWorkflow — pre-flight reads use the caller transaction when supplied', () => {
  const WF = read('lib/workflow-engine.ts')

  it('derives a reader from the outer transaction (tx ?? db)', () => {
    expect(WF).toMatch(/const reader:\s*DbOrTx\s*=\s*outerTx\s*\?\?\s*db/)
  })

  it('routes the workflow definition / steps / rules / SLA reads through reader', () => {
    expect(WF).toContain('const defRows = await reader')
    expect(WF).toContain('const steps = await reader')
    expect(WF).toContain('const slaCalendarRows = await reader')
    // No pre-flight read should still use the bare global pool inside submitWorkflow.
    expect(WF).toContain('const selectorRows = await reader')
  })

  it('passes reader into loadPersonContext, which reads via the executor', () => {
    expect(WF).toMatch(/loadPersonContext\([^)]*,\s*reader\s*\)/)
    expect(WF).toMatch(/executor:\s*DbOrTx\s*=\s*db/)
    expect(WF).toContain('const rows = await executor')
    expect(WF).toContain('const directReportRows = await executor')
  })
})
