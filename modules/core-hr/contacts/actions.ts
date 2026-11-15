'use server'

/**
 * Contact upsert action — creates, updates, or deactivates person_contacts rows.
 *
 * Strategy per contact type:
 *   value non-empty + row exists  → UPDATE contact_value, set is_active=true
 *   value non-empty + no row yet  → INSERT new active row
 *   value empty     + row exists  → SET is_active=false (soft-delete, keeps audit history)
 *   value empty     + no row      → no-op
 *
 * All mutations run in one transaction with a single audit row.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { personContacts, persons } from '@/drizzle/schema'
import { writeAuditLog } from '@/lib/audit'
import { requireRole } from '@/lib/auth'
import { requirePermission } from '@/lib/permissions'
import { TENANT_ID } from '@/lib/constants'
import { CONTACT_TYPES } from './constants'
export type { ContactType } from './constants'

// ── Input schema ───────────────────────────────────────────────────────────
const ContactEntrySchema = z.object({
  type:  z.enum(CONTACT_TYPES),
  value: z.string().max(200),
})

const UpsertContactsSchema = z.object({
  personId: z.string().uuid(),
  contacts: z.array(ContactEntrySchema),
})

export type UpsertContactsInput = z.infer<typeof UpsertContactsSchema>

export interface UpsertContactsResult {
  inserted: number
  updated:  number
  removed:  number
}

export async function upsertPersonContacts(
  personId: string,
  contacts: Array<{ type: string; value: string }>,
): Promise<UpsertContactsResult> {
  const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
  await requirePermission(actor, 'EMPLOYEE_PROFILE', 'edit')

  const input = UpsertContactsSchema.parse({ personId, contacts })

  // Confirm person exists and is in actor's entity scope
  const [person] = await db
    .select({ id: persons.id, legalEntityId: persons.legalEntityId, fullNameEn: persons.fullNameEn })
    .from(persons)
    .where(and(eq(persons.tenantId, TENANT_ID), eq(persons.id, input.personId)))
    .limit(1)
  if (!person) throw new Error('Person not found')
  if (actor.role !== 'SUPER_ADMIN' && actor.legalEntityId !== person.legalEntityId) {
    throw new Error('FORBIDDEN: person is outside your entity scope')
  }

  // Load all existing active contacts for this person
  const existing = await db
    .select()
    .from(personContacts)
    .where(and(
      eq(personContacts.tenantId, TENANT_ID),
      eq(personContacts.personId, input.personId),
      inArray(personContacts.contactType, CONTACT_TYPES as unknown as string[]),
    ))

  const existingByType = new Map(existing.map(r => [r.contactType, r]))

  let inserted = 0
  let updated  = 0
  let removed  = 0

  const now = new Date()

  await db.transaction(async tx => {
    for (const entry of input.contacts) {
      const existing = existingByType.get(entry.type)
      const trimmed  = entry.value.trim()

      if (trimmed) {
        if (existing) {
          if (existing.contactValue !== trimmed || !existing.isActive) {
            // Update existing row
            await tx.update(personContacts)
              .set({
                contactValue:    trimmed,
                isActive:        true,
                updatedBy:       actor.id,
                updatedByName:   actor.name,
                lastUpdatedDate: now,
              })
              .where(eq(personContacts.id, existing.id))
            updated++
          }
          // else: unchanged — no-op
        } else {
          // Insert new row
          await tx.insert(personContacts).values({
            tenantId:     TENANT_ID,
            personId:     input.personId,
            contactType:  entry.type,
            contactValue: trimmed,
            isPrimary:    entry.type === 'WORK_EMAIL' || entry.type === 'MOBILE_PRIMARY',
            isVerified:   false,
            isActive:     true,
            createdBy:    actor.id,
            createdByName: actor.name,
          })
          inserted++
        }
      } else if (existing && existing.isActive) {
        // Soft-delete: blank value = deactivate
        await tx.update(personContacts)
          .set({
            isActive:        false,
            updatedBy:       actor.id,
            updatedByName:   actor.name,
            lastUpdatedDate: now,
          })
          .where(eq(personContacts.id, existing.id))
        removed++
      }
    }

    if (inserted + updated + removed > 0) {
      await writeAuditLog({
        actorId:      actor.id,
        actorName:    actor.name,
        actorRole:    actor.role,
        channel:      'WEB',
        eventType:    'PERSON.CONTACTS_UPDATED',
        resourceType: 'person_contacts',
        resourceId:   input.personId,
        newValues: {
          personId:   input.personId,
          personName: person.fullNameEn,
          inserted, updated, removed,
          contacts: input.contacts
            .filter(c => c.value.trim())
            .map(c => ({ type: c.type, value: c.value.trim() })),
        },
      }, tx)
    }
  })

  revalidatePath(`/persons/${input.personId}/edit`)
  revalidatePath(`/persons/${input.personId}`)

  return { inserted, updated, removed }
}
