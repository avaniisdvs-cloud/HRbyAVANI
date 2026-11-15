/**
 * Manager report scoping — pure, side-effect-free helper shared by the Reports
 * page (Leave Summary / Leave Balances) and the CSV export route.
 *
 * A MANAGER may only ever see their own direct reports. The team allow-list
 * (managerTeamIds) is the single source of truth: it is the server-side fetched
 * set of persons whose lineManagerId === the manager. An optional ?person= URL
 * filter is honoured ONLY when the requested person is inside that allow-list —
 * this prevents URL-parameter privilege escalation (a manager cannot view an
 * employee outside their team by guessing an id).
 *
 * Keeping this logic in one tested function guarantees Leave Summary and Leave
 * Balances (and their CSV exports) stay in lock-step.
 */

export type ManagerPersonScope =
  | { mode: 'NO_TEAM' }
  | { mode: 'TEAM'; personIds: string[] }

export function resolveManagerPersonScope(
  managerTeamIds: string[],
  requestedPersonId: string | null | undefined,
): ManagerPersonScope {
  if (managerTeamIds.length === 0) return { mode: 'NO_TEAM' }

  // Honour single-employee filter only if the requested person is in the team.
  if (requestedPersonId && managerTeamIds.includes(requestedPersonId)) {
    return { mode: 'TEAM', personIds: [requestedPersonId] }
  }

  // Otherwise scope to the full direct-report set. A requested person outside
  // the team is silently ignored — never leaked.
  return { mode: 'TEAM', personIds: managerTeamIds }
}
