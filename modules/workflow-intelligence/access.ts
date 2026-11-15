/**
 * Pure, synchronous workflow-detail access decision (CWE-639 fix core).
 *
 * Kept out of the 'use server' query module so it can be unit-tested directly.
 * FAILS CLOSED: returns false unless the viewer is a stakeholder or an
 * entity-scoped privileged admin.
 */
export const HIGH_PRIVILEGE_ROLES = ['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'] as const

export interface AccessFacts {
  role:                   string
  personId?:              string | null
  viewerLegalEntityId:    string
  initiatedByPersonId:    string
  instanceLegalEntityId:  string
  stepAssigneePersonIds:  Array<string | null>
  /** True if the viewer decided or was delegated any step (DB-probed by caller). */
  isDeciderOrDelegate:    boolean
}

export function evaluateViewerAccess(f: AccessFacts): boolean {
  // SUPER_ADMIN — global.
  if (f.role === 'SUPER_ADMIN') return true
  // HR_ADMIN / HR_DIRECTOR — entity-scoped admin override.
  if ((HIGH_PRIVILEGE_ROLES as readonly string[]).includes(f.role)
      && f.instanceLegalEntityId === f.viewerLegalEntityId) return true
  // Stakeholders.
  if (!f.personId) return false
  if (f.initiatedByPersonId === f.personId) return true               // requester
  if (f.stepAssigneePersonIds.includes(f.personId)) return true       // assigned / current delegate
  return f.isDeciderOrDelegate                                        // decided / delegated-to (historical)
}
