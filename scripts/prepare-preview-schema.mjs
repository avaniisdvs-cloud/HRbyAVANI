import { config } from 'dotenv'
import postgres from 'postgres'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

config({ path: '.env.local' })
const target = new URL(process.env.DATABASE_URL ?? '')
if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) || process.env.DATABASE_ENV !== 'development') {
  throw new Error('Preview schema preparation requires a local development database')
}
const sql = postgres(process.env.DATABASE_URL, { max: 1 })
const files = [
  '0005_qa_audit_audit_immutable.sql',
  '0055_wip_step_instance_columns.sql',
  '0056_wip_notification_queue_meta.sql',
  '0060_wip_intelligence_view.sql',
  '0063_effective_dating_integrity.sql',
  '0064_worker_assignment_active_timeline.sql',
  '0065_identity_uniqueness.sql',
  '0067_workflow_audit_immutability.sql',
]
try {
  await sql`CREATE TABLE IF NOT EXISTS avaniis_preview_schema_ledger (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`
  for (const name of files) {
    const source = await readFile(new URL('../drizzle/migrations/' + name, import.meta.url), 'utf8')
    const checksum = createHash('sha256').update(source).digest('hex')
    const [existing] = await sql`SELECT checksum FROM avaniis_preview_schema_ledger WHERE name=${name}`
    if (existing) {
      if (existing.checksum !== checksum) throw new Error('Previously applied local SQL changed: ' + name)
      continue
    }
    await sql.begin(async tx => {
      await tx.unsafe(source.replace(/^\s*(BEGIN|COMMIT);\s*$/gm, ''))
      await tx`INSERT INTO avaniis_preview_schema_ledger (name,checksum) VALUES (${name},${checksum})`
      await tx`INSERT INTO audit_log (tenant_id,actor_id,actor_name,actor_role,channel,event_type,resource_type,new_values)
        VALUES ('00000000-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','Avaniis Preview Setup','SUPER_ADMIN','SYSTEM','PREVIEW.SCHEMA_PREPARED','avaniis_preview_schema_ledger',${sql.json({ name, checksum })})`
    })
    console.info('Prepared local preview SQL:', name)
  }
} catch (err) {
  console.error(err.message)
  process.exitCode = 1
} finally {
  await sql.end()
}
