/**
 * OCS — Org chart manager actions: route fix + direct-report scope.
 * Source-inspection (consistent with the repo's collision/fallback test style).
 * Behavioural proof: tests/e2e/orgchart-manager-actions.spec.ts.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')
const SHELL  = read('components/org-chart/OrgChartShell.tsx')
const ORGACT = read('modules/core-hr/org-chart-actions.ts')
const PERSON = read('modules/core-hr/actions.ts')
const SCOPE  = read('modules/core-hr/manager-scope.ts')

describe('Org chart View Profile route fix', () => {
  it('OCS-001: View Profile routes to /persons/ (with org-chart return tag), not /employees/', () => {
    expect(SHELL).toContain('router.push(`/persons/${pid}?from=org-chart`)')
    expect(SHELL).not.toContain('`/employees/${pid}`')
  })

  it('OCS-008: action lookups key on the unique node id (not non-unique positionId)', () => {
    // The positionId-keyed find caused View Profile to open the root manager
    // when several people shared one current_position_id. All action lookups
    // must resolve by n.id.
    expect(SHELL).toContain('rfNodes.find(n => n.id === actionPanel.nodeId)')
    expect(SHELL).toContain('rfNodes.find(n => n.id === transferDrawer.nodeId)')
    expect(SHELL).toContain('rfNodes.find(n => n.id === actingDrawer.nodeId)')
    expect(SHELL).not.toContain('n.data.positionId === actionPanel.nodeId')
  })

  it('OCS-002: no org chart action uses target="_blank" or window.open for navigation', () => {
    expect(SHELL).not.toMatch(/target=["']_blank["']/)
    expect(SHELL).not.toMatch(/window\.open\(/)
  })
})

describe('Unified direct-report scope helper', () => {
  it('OCS-003: helper checks BOTH persons.lineManagerId and worker_assignments', () => {
    expect(SCOPE).toContain('persons.lineManagerId')
    expect(SCOPE).toContain('workerAssignments.lineManagerId')
    expect(SCOPE).toMatch(/export async function isManagerDirectReport/)
  })
})

describe('getPerson manager scope uses unified helper', () => {
  it('OCS-004: getPerson MANAGER branch calls isManagerDirectReport', () => {
    expect(PERSON).toContain('isManagerDirectReport')
    expect(PERSON).toMatch(/user\.role === 'MANAGER'/)
  })
})

describe('Write-action manager scope (backend enforced)', () => {
  it('OCS-005: transfer/promotion + acting both reference the scope helper and a direct-reports message', () => {
    // Two scope guards (transfer/promotion + acting) each cite isManagerDirectReport
    expect(ORGACT.match(/isManagerDirectReport/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
    // User-facing direct-report restriction messages for both flows
    expect(ORGACT).toMatch(/transfers or promotions for your direct reports/i)
    expect(ORGACT).toMatch(/acting status for your direct reports/i)
  })

  it('OCS-006: scope helper is imported into the org chart actions module', () => {
    expect(ORGACT).toMatch(/import \{ isManagerDirectReport \} from '\.\/manager-scope'/)
  })

  it('OCS-007: scope gate is MANAGER-only (HR roles bypass — no regression)', () => {
    // both write actions guard with `user.role === 'MANAGER'`
    expect(ORGACT.match(/if \(user\.role === 'MANAGER'\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
  })
})
