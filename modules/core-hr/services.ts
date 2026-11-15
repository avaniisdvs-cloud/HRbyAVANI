/**
 * core-hr pure services — full-name composition, person-number generation,
 * Emiratisation eligibility, and role-aware PII masking / decryption.
 *
 * No `'use server'` directive — these are server-only helpers callable from
 * actions.ts and from Server Components. Some helpers query the DB (via the
 * passed-in tx handle); none of them write.
 */
import { eq, and, sql } from 'drizzle-orm'
import { legalEntities, persons } from '@/drizzle/schema'
import type { Person } from '@/drizzle/schema'
import { decryptNullable } from '@/lib/encryption'
import { TENANT_ID } from '@/lib/constants'
import type { CoreHrRole, PersonView, PiiAccessContext } from './types'

// ── Full-name composition ──────────────────────────────────────────────────
// Schema marks persons.full_name_en as `text` (computed by application).
// Always run through this helper before insert/update to keep it consistent.

export function composeFullNameEn(parts: {
  firstNameEn:  string
  middleNameEn?: string | null
  lastNameEn:   string
}): string {
  return [parts.firstNameEn, parts.middleNameEn, parts.lastNameEn]
    .filter(Boolean)
    .map(s => s!.trim())
    .filter(s => s.length > 0)
    .join(' ')
}

// ── Person-number generation ───────────────────────────────────────────────
// Format: `{empNumberPrefix}{padded-number}` e.g. `AVN0001` (no hyphen).
// Configured per entity under Settings → Employee Numbers (SUPER_ADMIN).
// Falls back to entityCode with legacy hyphen format if prefix not yet set.
//
// Per FR-CH-12 the number must be unique per entity. Computed inside the
// same transaction as the person insert for consistency.

export async function nextPersonNumber(
  legalEntityId: string,
  tx: { select: typeof import('@/lib/db').db.select; query: typeof import('@/lib/db').db.query },
): Promise<string> {
  const [entity] = await tx
    .select({
      entityCode:      legalEntities.entityCode,
      empNumberPrefix: legalEntities.empNumberPrefix,
      empNumberDigits: legalEntities.empNumberDigits,
      empNumberSeed:   legalEntities.empNumberSeed,
    })
    .from(legalEntities)
    .where(eq(legalEntities.id, legalEntityId))
    .limit(1)

  // ── Determine prefix and format ─────────────────────────────────────────
  // If empNumberPrefix is configured → new format (no hyphen): AVN0001
  // If not yet configured → legacy format: entityCode-000001 (backward compat)
  const hasConfig      = !!entity?.empNumberPrefix?.trim()
  const digits         = Math.max(3, Math.min(8, entity?.empNumberDigits ?? 4))
  const seed           = entity?.empNumberSeed ?? 0

  let prefix: string
  let numberPattern: string  // regex to extract numeric suffix from existing records

  if (hasConfig) {
    // New format: prefix letters only, no separator — AVN0001
    prefix        = entity!.empNumberPrefix!.trim().toUpperCase()
    numberPattern = `^${prefix}[0-9]+$`
  } else {
    // Legacy format: entityCode-NNNNNN
    const rawCode = (entity?.entityCode ?? 'EMP').toUpperCase()
    if (!/^[A-Z0-9_-]{1,30}$/.test(rawCode)) {
      throw new Error('legalEntities.entityCode contains invalid characters')
    }
    prefix        = rawCode
    numberPattern = `^${prefix}-[0-9]+$`
  }

  // QA-Audit-C1: prefix/pattern bound as Drizzle parameters — injection-safe.
  // SELECT MAX(numeric suffix) from existing person_numbers matching the pattern.
  const replacePattern = hasConfig ? `^${prefix}` : `^${prefix}-`
  const result = await tx
    .select({
      maxN: sql<number>`COALESCE(MAX(
        CASE WHEN ${persons.personNumber} ~ ${numberPattern}
          THEN REGEXP_REPLACE(${persons.personNumber}, ${replacePattern}, '', 'g')::int
          ELSE NULL
        END
      ), 0)`,
    })
    .from(persons)
    .where(
      and(
        eq(persons.tenantId, TENANT_ID),
        eq(persons.legalEntityId, legalEntityId),
      ),
    )

  // next = MAX(seed, current_max) + 1 — seed lets SUPER_ADMIN set a floor
  const currentMax = result[0]?.maxN ?? 0
  const next       = Math.max(seed, currentMax) + 1

  if (hasConfig) {
    // New format: AVN0001
    return `${prefix}${String(next).padStart(digits, '0')}`
  } else {
    // Legacy format: AVN-001-000001 (unchanged for entities not yet configured)
    return `${prefix}-${String(next).padStart(6, '0')}`
  }
}

// ── Format guards (FR-CH-13, FR-CH-14, BR-WPS-004) ─────────────────────────

export function assertEmiratesIdFormat(value: string): void {
  if (!/^784-\d{4}-\d{7}-\d{1}$/.test(value)) {
    throw new Error('BR-EID-001: Emirates ID must match 784-XXXX-XXXXXXX-X')
  }
}

export function assertUaeIbanFormat(iban: string): void {
  // BR-WPS-004 — 23-char IBAN starting with AE
  if (!/^AE\d{21}$/.test(iban)) {
    throw new Error('BR-WPS-004: UAE IBAN must be 23 characters starting with AE')
  }
}

// ── PII masking ────────────────────────────────────────────────────────────
// Applied at the API layer (per Security spec §2.3). Direct DB rows are never
// returned to the UI without going through these helpers.

/** `784-****-*******-3` — keeps category prefix + last digit. */
export function maskEmiratesId(plaintext: string | null): string | null {
  if (!plaintext) return null
  if (!/^784-\d{4}-\d{7}-\d{1}$/.test(plaintext)) return '****'
  return `784-****-*******-${plaintext.slice(-1)}`
}

/** Last 4 chars visible, rest stars. Works for any PII string. */
export function maskTail(plaintext: string | null, visible = 4): string | null {
  if (!plaintext) return null
  if (plaintext.length <= visible) return '*'.repeat(plaintext.length)
  return '•'.repeat(plaintext.length - visible) + plaintext.slice(-visible)
}

// ── Role-aware PII reveal ──────────────────────────────────────────────────
// Security spec §2.3: full IBAN, full passport, full Emirates ID visible
// only to PAYROLL_ADMIN, HR_DIRECTOR, SUPER_ADMIN, and (for own data) self.
// HR_ADMIN sees full PII WITHOUT step-up MFA in Phase 1 (per Functional Spec
// FR-AUTH-07 — step-up is enforced for IBAN unmasking at the bank-details
// endpoint specifically, not here for EID/passport).

const ROLES_WITH_FULL_PII: CoreHrRole[] = [
  'HR_ADMIN', 'PAYROLL_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN',
]

export function canSeeFullPii(person: Person, ctx: PiiAccessContext): boolean {
  if (ctx.viewerPersonId && ctx.viewerPersonId === person.id) return true
  return ROLES_WITH_FULL_PII.includes(ctx.role as CoreHrRole)
}

/**
 * Materialise a Person row into a PersonView with PII either decrypted
 * (privileged caller) or masked (everyone else). Caller is responsible for
 * passing a sane ctx — Server Actions read it from the JWT.
 */
export function projectPerson(person: Person, ctx: PiiAccessContext): PersonView {
  const full = canSeeFullPii(person, ctx)
  const eidPlain  = full ? decryptNullable(person.emiratesId)     : null
  const passPlain = full ? decryptNullable(person.passportNumber) : null

  return {
    ...person,
    emiratesId:     full ? eidPlain  : maskEmiratesId(decryptNullable(person.emiratesId)),
    passportNumber: full ? passPlain : maskTail(decryptNullable(person.passportNumber), 4),
    piiMasked:      !full,
  }
}

// ── Emiratisation eligibility (S3-12) ──────────────────────────────────────
// "Emiratisation-eligible" = UAE national whose current job carries the
// is_emiratisation_target flag. Used for Nafis quota counters.

export function isEmiratisationEligible(p: Pick<Person, 'nationalityCategory'> & {
  jobIsEmiratisationTarget?: boolean | null
}): boolean {
  return p.nationalityCategory === 'UAE_NATIONAL' && p.jobIsEmiratisationTarget === true
}
