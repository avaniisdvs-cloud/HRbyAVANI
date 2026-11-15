/**
 * Shared constants for the profile module.
 * Kept in a separate file (not 'use server') so they can be imported by
 * both server actions and client components without violating the Next.js
 * "use server files may only export async functions" constraint.
 */

export const ALLOWED_RELATIONSHIPS = [
  'SPOUSE', 'PARENT', 'FATHER', 'MOTHER', 'CHILD', 'SON', 'DAUGHTER',
  'SIBLING', 'BROTHER', 'SISTER', 'RELATIVE', 'GUARDIAN', 'FRIEND', 'OTHER',
] as const

export type EmergencyRelationship = typeof ALLOWED_RELATIONSHIPS[number]
