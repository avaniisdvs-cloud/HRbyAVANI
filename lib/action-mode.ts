/**
 * Shared effective-dating action mode type.
 *
 * UPDATE      — creates a new history row (close current + open new).
 * CORRECTION  — edits the existing row in-place; no new history row created.
 *               Requires HR_DIRECTOR or SUPER_ADMIN role.
 * FUTURE_DATED — inserts a new row with isCurrent=false, effective on a
 *               future date.
 * RETRO_SPLIT  — system-created replacement slice for a retroactive correction
 *               inside an existing effective-dated timeline.
 */
export type ActionMode = 'UPDATE' | 'CORRECTION' | 'FUTURE_DATED' | 'RETRO_SPLIT'

// Modes callers may request through changeAssignmentTx. RETRO_SPLIT is stored
// on generated rows only; it is not a public mutation mode.
export type ChangeAssignmentMode = Exclude<ActionMode, 'RETRO_SPLIT'>
