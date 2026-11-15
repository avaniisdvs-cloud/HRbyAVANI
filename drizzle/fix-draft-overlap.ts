/**
 * Diagnostic + fix script for DRAFT leave request overlap.
 * Run: ./node_modules/.bin/tsx --env-file=.env.local drizzle/fix-draft-overlap.ts
 */
import 'dotenv/config'
import { db } from '../lib/db'
import { eq, inArray } from 'drizzle-orm'
import { absenceEntries } from './schema/foundation'

async function main() {
  // Find all DRAFT leave requests
  console.log('=== Querying all DRAFT leave requests ===\n')

  const drafts = await db
    .select({
      id: absenceEntries.id,
      personId: absenceEntries.personId,
      startDate: absenceEntries.startDate,
      endDate: absenceEntries.endDate,
      status: absenceEntries.status,
      createdDate: absenceEntries.createdDate,
    })
    .from(absenceEntries)
    .where(eq(absenceEntries.status, 'DRAFT'))

  if (drafts.length === 0) {
    console.log('No DRAFT leave requests found.\n')
  } else {
    console.log(`Found ${drafts.length} DRAFT leave request(s):\n`)
    for (const d of drafts) {
      console.log(
        `  ID: ${d.id}  Person: ${d.personId}  ${d.startDate} → ${d.endDate}  Created: ${d.createdDate}`
      )
    }
  }

  // Also check PENDING requests
  const pending = await db
    .select({
      id: absenceEntries.id,
      personId: absenceEntries.personId,
      startDate: absenceEntries.startDate,
      endDate: absenceEntries.endDate,
      status: absenceEntries.status,
      createdDate: absenceEntries.createdDate,
    })
    .from(absenceEntries)
    .where(eq(absenceEntries.status, 'PENDING'))

  console.log(`\nFound ${pending.length} PENDING leave request(s):`)
  for (const p of pending) {
    console.log(
      `  ID: ${p.id}  Person: ${p.personId}  ${p.startDate} → ${p.endDate}  Created: ${p.createdDate}`
    )
  }

  // Cancel all DRAFTs created today (they're from failed submit attempts)
  if (drafts.length > 0) {
    const today = new Date().toISOString().slice(0, 10) // 2026-05-21
    const todayDrafts = drafts.filter((d) => {
      const created = d.createdDate
        ? new Date(d.createdDate).toISOString().slice(0, 10)
        : ''
      return created === today
    })

    if (todayDrafts.length > 0) {
      console.log(
        `\n=== Cancelling ${todayDrafts.length} DRAFT(s) created today (${today}) ===\n`
      )
      const ids = todayDrafts.map((d) => d.id)
      await db
        .update(absenceEntries)
        .set({ status: 'CANCELLED', updatedDate: new Date() })
        .where(inArray(absenceEntries.id, ids))
      console.log(`Cancelled IDs:\n  ${ids.join('\n  ')}\n`)
      console.log('Done. You can now submit a new leave request without overlap conflicts.')
    } else {
      console.log('\nNo DRAFTs created today — overlap may not be the issue.')
      console.log('DRAFTs above are from previous days. Skipping auto-cancel.')
    }
  }

  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
