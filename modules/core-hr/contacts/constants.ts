/**
 * Contact-type constants — plain module (no 'use server').
 * Imported by both the server action and any client-facing code.
 */

export const CONTACT_TYPES = [
  'WORK_EMAIL',
  'PERSONAL_EMAIL',
  'MOBILE_PRIMARY',
  'MOBILE_SECONDARY',
  'WORK_PHONE',
  'HOME_PHONE',
  'WHATSAPP',
] as const

export type ContactType = (typeof CONTACT_TYPES)[number]
