/**
 * Employees page — Department Head filter (DHF).
 *
 * Zod behavioral tests + source-contract guards so the regression-critical
 * invariants (manager scoping, count/rows sync, entity-scoped LOV, URL state,
 * export independence) cannot silently regress. Source-inspection only for the
 * contract guards (no DB) — mirrors dashboard-drilldown.test.ts.
 *
 * Maps to the approved test plan:
 *   1 no filter unchanged · 2 head filter · 3 dept+head · 4 entity+head ·
 *   5 invalid id · 6 pagination · 7 counts · 8 exports · 9 URL refresh · 10 deep-link
 */

import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { ListPersonsFilterSchema } from '@/modules/core-hr/validations'

const ROOT = path.resolve(__dirname, '../..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf-8')

const actionsSrc    = read('modules/core-hr/actions.ts')
const pageSrc       = read('app/(hr-admin)/persons/page.tsx')
const filterBarSrc  = read('app/(hr-admin)/persons/PersonFilterBar.tsx')
const exportSrc     = read('app/(hr-admin)/reports/export/route.ts')

const VALID = '11111111-1111-1111-1111-111111111111'

describe('DHF — ListPersonsFilterSchema validation', () => {
  it('DHF-Z1: accepts a valid departmentHeadId uuid', () => {
    const r = ListPersonsFilterSchema.parse({ departmentHeadId: VALID })
    expect(r.departmentHeadId).toBe(VALID)
  })

  it('DHF-Z2 (scenario 5): rejects a non-uuid departmentHeadId', () => {
    expect(() => ListPersonsFilterSchema.parse({ departmentHeadId: 'not-a-uuid' })).toThrow()
  })

  it('DHF-Z3 (scenario 1): is optional — absent leaves results unfiltered', () => {
    const r = ListPersonsFilterSchema.parse({})
    expect(r.departmentHeadId).toBeUndefined()
  })

  it('DHF-Z4 (scenarios 3,4): composes with departmentId and legalEntityId', () => {
    const r = ListPersonsFilterSchema.parse({
      departmentId: VALID, legalEntityId: VALID, departmentHeadId: VALID,
    })
    expect(r.departmentHeadId).toBe(VALID)
    expect(r.departmentId).toBe(VALID)
    expect(r.legalEntityId).toBe(VALID)
  })
})

describe('DHF — listPersons query contract', () => {
  it('DHF-Q1 (scenario 2): pushes the head predicate into the shared conditions array', () => {
    expect(actionsSrc).toMatch(/conditions\.push\(eq\(departments\.headPersonId,\s*f\.departmentHeadId\)\)/)
  })

  it('DHF-Q2 (scenario 7,9 — count/rows sync): departments is leftJoined in BOTH queries (no new join)', () => {
    const joins = actionsSrc.match(/leftJoin\(departments, eq\(persons\.currentDepartmentId, departments\.id\)\)/g) || []
    expect(joins.length).toBeGreaterThanOrEqual(2) // count query + rows query
  })

  it('DHF-Q3 (MANAGER scoping intact): head predicate appears AFTER the MANAGER direct-report block', () => {
    const mgrIdx  = actionsSrc.indexOf("user.role === 'MANAGER'")
    const headIdx = actionsSrc.indexOf('eq(departments.headPersonId, f.departmentHeadId)')
    expect(mgrIdx).toBeGreaterThan(-1)
    expect(headIdx).toBeGreaterThan(mgrIdx) // ANDs on top, never replaces manager scoping
  })

  it('DHF-Q4: head predicate appears AFTER entity scoping (cannot widen entity scope)', () => {
    const entityIdx = actionsSrc.indexOf('eq(persons.legalEntityId, scopedEntityId)')
    const headIdx   = actionsSrc.indexOf('eq(departments.headPersonId, f.departmentHeadId)')
    expect(headIdx).toBeGreaterThan(entityIdx)
  })
})

describe('DHF — persons page wiring', () => {
  // Option D redesign (2026-06): the page no longer renders a Department Head
  // LOV dropdown — cohort segments + Entity/Department chips replaced the old
  // filter wall. Deep-link URLs (?departmentHeadId=…) must still filter,
  // server-side, through listPersons (which enforces entity/MANAGER scoping).

  it('DHF-P1 (scenario 9/10 — deep-link): departmentHeadId threaded through SearchParams + listPersons', () => {
    expect(pageSrc).toMatch(/departmentHeadId\?:\s*string/)
    expect(pageSrc).toMatch(/departmentHeadId:\s*sp\.departmentHeadId\s*\|\|\s*undefined/)
  })

  it('DHF-P2 (no cross-entity leak): page builds NO head LOV — head names never queried client-side', () => {
    // The old page exposed a head-name LOV that needed entity clamping
    // (headScopeEntityId). Option D removed the LOV entirely, so there is no
    // surface to leak cross-entity names from. Guard that it stays removed —
    // reintroducing a head LOV must bring back entity-scoped selectDistinct.
    expect(pageSrc).not.toMatch(/selectDistinct/)
    expect(pageSrc).not.toMatch(/headPersonId/)
  })

  it('DHF-P3 (server-filtered): departmentHeadId is applied inside listPersons, not client-side', () => {
    // The rows handed to the client component are already head-filtered by
    // listPersons; the client never receives unfiltered cross-cohort rows.
    expect(pageSrc).toMatch(/listPersons\(\{[\s\S]*?departmentHeadId:\s*sp\.departmentHeadId\s*\|\|\s*undefined[\s\S]*?\}\)/)
  })
})

describe('DHF — filter bar wiring', () => {
  it('DHF-F1: reuses the existing searchable PersonSelect LOV component', () => {
    expect(filterBarSrc).toMatch(/import \{ PersonSelect, type PersonOption \} from '@\/components\/forms\/PersonSelect'/)
    expect(filterBarSrc).toMatch(/<PersonSelect/)
  })

  it('DHF-F2 (scenario 9,10 — URL/deep-link): writes the departmentHeadId URL param', () => {
    expect(filterBarSrc).toMatch(/setParam\('departmentHeadId',\s*id \|\| undefined\)/)
  })

  it('DHF-F3: provides a Clear affordance (PersonSelect has no empty option)', () => {
    expect(filterBarSrc).toMatch(/setParam\('departmentHeadId',\s*undefined\)/)
  })
})

describe('DHF — export independence (scenario 8)', () => {
  it('DHF-X1: the reports export route does NOT consume listPersons (separate query source)', () => {
    expect(exportSrc).not.toMatch(/listPersons/)
  })
})
