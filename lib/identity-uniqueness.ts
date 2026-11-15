/**
 * Foundation Stewardship P1-H4 — identity uniqueness service.
 *
 * Application-layer duplicate guard for person identity fields, called inside
 * the same transaction as the person INSERT/UPDATE so check + write are atomic
 * under the connection's snapshot. Migration 0065 adds matching partial UNIQUE
 * indexes as the database backstop (race-proof once applied).
 *
 * Layers:
 *   • employee_code  — plain column; case-insensitive check ALWAYS enforced.
 *   • emirates_id / passport_number — enforced via deterministic hash columns
 *     ONLY when IDENTITY_UNIQUENESS_ENFORCEMENT=true (post-0065 + backfill),
 *     because the hash columns do not exist on pre-0065 databases.
 */

import { and, eq, ne, sql } from 'drizzle-orm'
import { persons } from '@/drizzle/schema'
import type { DbOrTx } from '@/lib/db'
import {
  emiratesIdHash,
  passportNumberHash,
  isIdentityHashEnforcementEnabled,
} from '@/lib/identity-hash'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

export interface IdentityUniquenessInput {
  /** Exclude this person (update path). Omit on create. */
  excludePersonId?: string
  employeeCode?:    string | null
  emiratesId?:      string | null   // cleartext (pre-encryption); hashed here
  passportNumber?:  string | null   // cleartext (pre-encryption); hashed here
}

export class IdentityConflictError extends Error {
  constructor(public readonly field: 'employeeCode' | 'emiratesId' | 'passportNumber') {
    super(
      field === 'employeeCode'
        ? 'IDENTITY_CONFLICT: Employee code is already assigned to another person.'
        : field === 'emiratesId'
          ? 'IDENTITY_CONFLICT: Emirates ID is already registered to another person.'
          : 'IDENTITY_CONFLICT: Passport number is already registered to another person.',
    )
    this.name = 'IdentityConflictError'
  }
}

async function existsOther(
  client: DbOrTx,
  condition: ReturnType<typeof sql> | ReturnType<typeof eq>,
  excludePersonId?: string,
): Promise<boolean> {
  const rows = await client
    .select({ id: persons.id })
    .from(persons)
    .where(and(
      eq(persons.tenantId, TENANT_ID),
      condition,
      excludePersonId ? ne(persons.id, excludePersonId) : undefined,
    ))
    .limit(1)
  return rows.length > 0
}

/**
 * Throws IdentityConflictError when another person already holds one of the
 * supplied identifiers. Call inside the person write transaction, BEFORE the
 * INSERT/UPDATE. BR-ID-UNIQ-001.
 */
export async function assertPersonIdentityUnique(
  client: DbOrTx,
  input: IdentityUniquenessInput,
): Promise<void> {
  const { excludePersonId } = input

  if (input.employeeCode) {
    const code = input.employeeCode.trim()
    if (code) {
      const dup = await existsOther(
        client,
        sql`lower(${persons.employeeCode}) = lower(${code})`,
        excludePersonId,
      )
      if (dup) throw new IdentityConflictError('employeeCode')
    }
  }

  if (!isIdentityHashEnforcementEnabled()) return

  const eidHash = emiratesIdHash(input.emiratesId)
  if (eidHash) {
    const dup = await existsOther(
      client,
      sql`${persons.emiratesIdHash} = ${eidHash}`,
      excludePersonId,
    )
    if (dup) throw new IdentityConflictError('emiratesId')
  }

  const ppHash = passportNumberHash(input.passportNumber)
  if (ppHash) {
    const dup = await existsOther(
      client,
      sql`${persons.passportNumberHash} = ${ppHash}`,
      excludePersonId,
    )
    if (dup) throw new IdentityConflictError('passportNumber')
  }
}

/**
 * Insert/update payload fragment for the hash columns. Returns {} while
 * enforcement is disabled so pre-0065 databases never see the new columns.
 */
export function identityHashColumns(
  emiratesId: string | null | undefined,
  passportNumber: string | null | undefined,
): { emiratesIdHash?: string | null; passportNumberHash?: string | null } {
  if (!isIdentityHashEnforcementEnabled()) return {}
  return {
    emiratesIdHash:     emiratesIdHash(emiratesId),
    passportNumberHash: passportNumberHash(passportNumber),
  }
}
