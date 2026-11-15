// P0 data reconcile — close workflow instances orphaned by a terminal resource.
//
// Mirrors lib/workflow-engine.ts cancelWorkflowInstance for rows where the
// underlying absence request is already terminal (CANCELLED/REJECTED/WITHDRAWN/
// TAKEN) but the workflow instance is still live (PENDING/IN_PROGRESS/ESCALATED/
// ON_HOLD) and its steps were never recalled (the LR-0000001 class).
//
// IDEMPOTENT: only touches still-divergent rows. SAFE: refuses to run against
// anything but a non-production cloud DEV/UAT database. Each row is closed in a
// single transaction with a workflow_audit_log entry (ADR-001).
import fs from 'node:fs'
import postgres from 'postgres'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const env = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const get = (k) => env.split('\n').find(l => l.startsWith(k + '='))?.slice(k.length + 1).trim().replace(/^["']|["']$/g, '')
const url = get('DATABASE_URL')
const dbEnv = (get('DATABASE_ENV') || '').toLowerCase()

// ── Self-guard: never production ─────────────────────────────────────────────
if (!url) throw new Error('DATABASE_URL not set')
const host = new URL(url).hostname
const NON_PROD = ['development', 'dev', 'test', 'uat']
if (!NON_PROD.includes(dbEnv)) {
  console.error(`REFUSING: DATABASE_ENV='${dbEnv}' is not a non-production value. Aborting.`)
  process.exit(1)
}
if (!/\.neon\.tech$/.test(host) && !/^localhost$/.test(host)) {
  console.error(`REFUSING: host '${host}' is not a recognised DEV/UAT cloud/local host. Aborting.`)
  process.exit(1)
}
console.log(`Reconcile target: host=${host} DATABASE_ENV=${dbEnv}`)

const sql = postgres(url, { ssl: 'require', max: 1, prepare: false })
const ACTIONABLE = ['PENDING', 'IN_PROGRESS', 'ESCALATED', 'ON_HOLD']
const TERMINAL_ABSENCE = ['CANCELLED', 'REJECTED', 'WITHDRAWN', 'TAKEN']

try {
  const divergent = await sql`
    select a.id as absence_id, a.request_number, a.status as absence_status,
           a.workflow_instance_id as instance_id, i.status as instance_status
    from absence_entries a
    join workflow_instances_v2 i on i.id = a.workflow_instance_id
    where a.status in ${sql(TERMINAL_ABSENCE)}
      and i.status::text in ${sql(ACTIONABLE)}`
  console.log(`\nDivergent rows to reconcile: ${divergent.length}`)
  for (const d of divergent) console.log(`  ${d.request_number}: absence=${d.absence_status} instance=${d.instance_status} (${d.instance_id})`)

  let closed = 0
  for (const d of divergent) {
    const reason = `Data reconciliation (P0): underlying request already ${d.absence_status}; closing orphaned workflow instance`
    await sql.begin(async (tx) => {
      // Re-check inside the tx (idempotent / concurrency-safe).
      const [live] = await tx`select status from workflow_instances_v2 where id = ${d.instance_id} for update`
      if (!live || !ACTIONABLE.includes(live.status)) return

      await tx`
        update workflow_instances_v2
        set status='CANCELLED', completed_at=now(), recalled_at=now(),
            recall_reason=${reason}, updated_by_name='SYSTEM (data reconcile)', last_updated_date=now()
        where id=${d.instance_id}`

      await tx`
        update workflow_step_instances
        set status='RECALLED', updated_by_name='SYSTEM (data reconcile)', last_updated_date=now()
        where instance_id=${d.instance_id} and status in ('WAITING','PENDING')`

      await tx`
        update notification_log
        set status='ACTIONED', read_at=now()
        where tenant_id=${TENANT_ID} and reference_type='WORKFLOW_INSTANCE' and reference_id=${d.instance_id}`

      await tx`
        insert into workflow_audit_log (tenant_id, instance_id, action, actor_name, event_data)
        values (${TENANT_ID}, ${d.instance_id}, 'INSTANCE_CANCELLED', 'SYSTEM (data reconcile)',
                ${sql.json({ reason, requestNumber: d.request_number, previousInstanceStatus: d.instance_status, absenceStatus: d.absence_status })})`
      closed++
    })
    console.log(`  ✓ closed ${d.request_number}`)
  }

  const [{ remaining }] = await sql`
    select count(*)::int as remaining
    from absence_entries a
    join workflow_instances_v2 i on i.id = a.workflow_instance_id
    where a.status in ${sql(TERMINAL_ABSENCE)}
      and i.status::text in ${sql(ACTIONABLE)}`
  console.log(`\nClosed ${closed} instance(s). Remaining divergent rows: ${remaining}`)
  if (remaining !== 0) { console.error('WARNING: divergence remains — investigate.'); process.exitCode = 2 }
} finally {
  await sql.end()
}
