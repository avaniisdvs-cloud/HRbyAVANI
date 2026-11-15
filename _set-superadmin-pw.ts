import { db } from '@/lib/db'
import { userAccounts } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'

;(async () => {
  const password = process.argv[2]
  if (!password) {
    console.error('Usage: pnpm exec tsx _set-superadmin-pw.ts <password>')
    process.exit(1)
  }
  const hash = bcrypt.hashSync(password, 12)

  const result = await db.update(userAccounts)
    .set({ passwordHash: hash })
    .where(eq(userAccounts.primaryEmail, 'superadmin@avaniis.dev'))
    .returning({ id: userAccounts.id, email: userAccounts.primaryEmail })

  if (result.length > 0) {
    console.log('✓ Password hash saved for:', result[0].email)
    console.log('  Temporary password:', password)
    console.log('  CHANGE THIS BEFORE DEMO.')
  } else {
    console.log('0 rows updated — superadmin@avaniis.dev not found in DB.')
    console.log('Create the Super Admin employee record first, then re-run.')
  }
  process.exit(0)
})()
