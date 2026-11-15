/**
 * P2 Fix: Set KPD003 (Talal M. Al Gaddah) avaniisRole EMPLOYEE → MANAGER
 * KPD004 worker_assignment.lineManagerId points to KPD003, but roles were inverted in seed data.
 */
import 'dotenv/config'
import { db } from '../lib/db'
import { userAccounts, auditLog } from '../drizzle/schema'
import { and, eq } from 'drizzle-orm'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const KPD003_PERSON_ID = '9285042e-309c-4773-b5f3-c0c9e91b73a4'
const SYSTEM_ACTOR = {
  id:   '00000000-0000-0000-0000-000000000000',
  name: 'system:p2-role-fix',
}

async function main() {
  const existing = await db
    .select({ id: userAccounts.id, role: userAccounts.avaniisRole, email: userAccounts.primaryEmail })
    .from(userAccounts)
    .where(and(
      eq(userAccounts.tenantId, TENANT_ID),
      eq(userAccounts.personId, KPD003_PERSON_ID),
    ))
    .limit(1)

  if (!existing.length) {
    console.error('ERROR: KPD003 user_account not found')
    process.exit(1)
  }

  const { id: accountId, role: currentRole, email } = existing[0]
  console.log(`Found: ${email} | current role: ${currentRole} | accountId: ${accountId}`)

  if (currentRole === 'MANAGER') {
    console.log('Role is already MANAGER — nothing to do.')
    process.exit(0)
  }

  await db.transaction(async tx => {
    await tx.update(userAccounts)
      .set({
        avaniisRole:     'MANAGER',
        lastUpdatedDate: new Date(),
      })
      .where(and(
        eq(userAccounts.tenantId, TENANT_ID),
        eq(userAccounts.id, accountId),
      ))

    await tx.insert(auditLog).values({
      actorId:      SYSTEM_ACTOR.id,
      actorName:    SYSTEM_ACTOR.name,
      actorRole:    'SYSTEM',
      channel:      'SYSTEM',
      eventType:    'USER_ACCOUNT.ROLE_UPDATED',
      resourceType: 'user_accounts',
      resourceId:   accountId,
      changedFields: ['avaniisRole'],
      oldValues:    { avaniisRole: currentRole },
      newValues:    { avaniisRole: 'MANAGER' },
      description:  'P2 data fix — KPD003 role was incorrectly EMPLOYEE; worker_assignment confirms KPD003 is line manager of KPD004',
    })
  })

  console.log(`✓ KPD003 role updated: ${currentRole} → MANAGER`)
  console.log('✓ Audit log entry written')
  process.exit(0)
}

main().catch(err => { console.error(err); process.exit(1) })
