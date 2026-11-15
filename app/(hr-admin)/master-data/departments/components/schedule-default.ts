// Pure helper for the Department drawer — no React/client deps so it is
// directly unit-testable.

export interface ScheduleOption {
  id:             string
  scheduleNameEn: string
  scheduleCode:   string
  isDefault:      boolean
  legalEntityId:  string | null
}

/**
 * Resolves the default Work Schedule for a newly-created department in a given
 * legal entity: the entity's own active default schedule wins; otherwise a
 * tenant-global (no-entity) default; otherwise none ('').
 */
export function resolveDefaultScheduleId(
  schedules: ScheduleOption[],
  legalEntityId: string,
): string {
  if (!legalEntityId) return ''
  const entityDefault = schedules.find(s => s.isDefault && s.legalEntityId === legalEntityId)
  if (entityDefault) return entityDefault.id
  const globalDefault = schedules.find(s => s.isDefault && !s.legalEntityId)
  return globalDefault?.id ?? ''
}
