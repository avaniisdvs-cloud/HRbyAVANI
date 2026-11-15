/**
 * Manager Reports — direct-report scoping (Leave Summary / Leave Balances)
 *
 * resolveManagerPersonScope is the single source of truth shared by the Reports
 * page and the CSV export route. It guarantees a MANAGER only ever sees their
 * own direct reports and cannot escalate via the ?person= URL parameter.
 *
 * Tests:
 *   RMS-001: Manager with a team → scopes to the full direct-report allow-list
 *            (Leave Summary shows direct-report rows, same scope as Balances).
 *   RMS-002: ?person= in own team → narrows to that single employee.
 *   RMS-003: ?person= OUTSIDE the team → ignored; falls back to full team,
 *            the outsider is never included (no scope escalation).
 *   RMS-004: Empty team → NO_TEAM (caller pushes 1=0 → manager sees nothing).
 *   RMS-005: No ?person= filter → full team.
 */

import { describe, it, expect } from 'vitest'
import { resolveManagerPersonScope } from '@/modules/absence/report-scope'

const TEAM = ['p-1', 'p-2', 'p-3']

describe('resolveManagerPersonScope', () => {
  it('RMS-001: manager with a team scopes to the full direct-report allow-list', () => {
    const scope = resolveManagerPersonScope(TEAM, '')
    expect(scope.mode).toBe('TEAM')
    expect(scope).toEqual({ mode: 'TEAM', personIds: TEAM })
  })

  it('RMS-002: ?person= within own team narrows to that single employee', () => {
    const scope = resolveManagerPersonScope(TEAM, 'p-2')
    expect(scope).toEqual({ mode: 'TEAM', personIds: ['p-2'] })
  })

  it('RMS-003: ?person= outside the team is ignored — never leaked, falls back to full team', () => {
    const scope = resolveManagerPersonScope(TEAM, 'outsider-999')
    expect(scope.mode).toBe('TEAM')
    if (scope.mode === 'TEAM') {
      expect(scope.personIds).toEqual(TEAM)
      expect(scope.personIds).not.toContain('outsider-999')
    }
  })

  it('RMS-004: empty team yields NO_TEAM so the caller scopes the query to nothing', () => {
    expect(resolveManagerPersonScope([], '')).toEqual({ mode: 'NO_TEAM' })
    // Even a requested person cannot conjure access when there is no team.
    expect(resolveManagerPersonScope([], 'p-1')).toEqual({ mode: 'NO_TEAM' })
  })

  it('RMS-005: no person filter (null/undefined) returns the full team', () => {
    expect(resolveManagerPersonScope(TEAM, null)).toEqual({ mode: 'TEAM', personIds: TEAM })
    expect(resolveManagerPersonScope(TEAM, undefined)).toEqual({ mode: 'TEAM', personIds: TEAM })
  })
})
