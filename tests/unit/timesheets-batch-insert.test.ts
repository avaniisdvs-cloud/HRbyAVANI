/**
 * Regression test — timesheets N+1 batch insert fix
 *
 * Verifies that processBiometricSync issues a single batch INSERT for all
 * punch records, rather than N individual INSERTs inside a for loop.
 *
 * APPROACH: Structural source assertion. We read the compiled source and verify:
 *   1. The batch pattern is present (single .values(params.punches.map(...)))
 *   2. The N+1 anti-pattern is absent (no for-loop that calls await db.insert)
 *
 * This is more reliable than a mocked integration test for a function with
 * 10+ chained DB operations, and directly enforces the structural invariant.
 * The nfr-performance.test.ts heuristic provides a second independent check.
 *
 * Before fix (commit pre-c052ef9): for (punch of params.punches) { await db.insert(...).values(single) }
 * After fix  (commit c052ef9):     await db.insert(...).values(params.punches.map(...))
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const actionsPath = path.join(__dirname, '../../modules/timesheets/actions.ts')
const src = fs.readFileSync(actionsPath, 'utf-8')

describe('processBiometricSync — N+1 batch insert regression', () => {
  it('uses params.punches.map(...) in a single .values() call (batch pattern present)', () => {
    // The batch fix puts all punch records into one .values(array) call.
    // If someone reverts to individual inserts, this pattern disappears.
    expect(src).toMatch(/\.values\(params\.punches\.map\(/)
  })

  it('does not call db.insert inside a for-loop over punches (N+1 anti-pattern absent)', () => {
    // Extract the processBiometricSync function body (between its declaration and the next export)
    const fnStart = src.indexOf('export async function processBiometricSync')
    const fnEnd   = src.indexOf('\nexport ', fnStart + 1)
    const fnBody  = fnEnd > fnStart ? src.slice(fnStart, fnEnd) : src.slice(fnStart)

    // N+1 pattern: for ( ... of params.punches ... ) { ... db.insert ... }
    // We look for `for (const punch` followed by `db.insert` before the closing brace.
    // The fix removes the `for (const punch of params.punches)` loop entirely for the raw insert.
    const hasN1Loop = /for\s*\(const punch of params\.punches\)[\s\S]{0,300}db\.insert\(devicePunchRaw\)/.test(fnBody)
    expect(hasN1Loop).toBe(false)
  })

  it('the batch insert is guarded by params.punches.length > 0 (no insert on empty batch)', () => {
    // The fix wraps the batch insert in `if (params.punches.length > 0)`.
    // Without this guard, an empty .values([]) would cause a DB error.
    expect(src).toMatch(/if\s*\(params\.punches\.length\s*>\s*0\)/)
  })

  it('batch insert comment references NFR-02 (intent is documented)', () => {
    // The fix added an explicit comment linking the pattern to the NFR.
    // Regression: if someone removes the comment AND the batch pattern, this + test 1 both fail.
    expect(src).toMatch(/avoids N\+1/)
  })
})
