#!/usr/bin/env node
/**
 * P1-H4 backfill — populate persons.emirates_id_hash / passport_number_hash
 * from the encrypted columns, and report duplicate identity COUNTS (never
 * the identifiers themselves).
 *
 * Guarded like other DB scripts:
 *   REPORT_ONLY=true  node scripts/backfill-identity-hashes.mjs   ← read-only duplicate report
 *   ALLOW_NON_PROD_CLOUD_DB_WRITE=true ENV_GOVERNANCE_MODE=single-dev-uat \
 *     node scripts/backfill-identity-hashes.mjs                   ← write hashes
 *
 * Prerequisite for write mode: migration 0065 Step 1 applied (columns exist).
 */
import { createRequire } from 'module'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { createHmac, createDecipheriv } from 'crypto'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
try { require('dotenv').config({ path: resolve(root, '.env.local') }) } catch {}

const REPORT_ONLY = process.env.REPORT_ONLY === 'true'
if (!REPORT_ONLY && process.env.ALLOW_NON_PROD_CLOUD_DB_WRITE !== 'true') {
  console.error('ABORT: write mode requires ALLOW_NON_PROD_CLOUD_DB_WRITE=true (or use REPORT_ONLY=true).')
  process.exit(1)
}

const KEY_HEX = process.env.ENCRYPTION_KEY ?? ''
if (!/^[0-9a-f]{64}$/i.test(KEY_HEX)) { console.error('ABORT: ENCRYPTION_KEY missing/invalid.'); process.exit(1) }
const KEY = Buffer.from(KEY_HEX, 'hex')

// Mirrors lib/encryption.ts format: base64( iv[12] | tag[16] | ciphertext ).
// Buffers shorter than iv+tag are legacy plaintext — returned as-is, like decrypt().
function decrypt(stored) {
  if (!stored) return null
  try {
    const buf = Buffer.from(stored, 'base64')
    if (buf.length < 12) return null
    if (buf.length < 28) return stored
    const d = createDecipheriv('aes-256-gcm', KEY, buf.subarray(0, 12))
    d.setAuthTag(buf.subarray(12, 28))
    return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8')
  } catch { return null }
}
const hmac = (ctx, v) => createHmac('sha256', KEY).update(`${ctx}|${v}`).digest('hex')
const eidHash = v => { const n = (v ?? '').replace(/[^0-9]/g, ''); return n ? hmac('avaniis:identity:eid:v1', n) : null }
const ppHash  = v => { const n = (v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, ''); return n ? hmac('avaniis:identity:passport:v1', n) : null }

const postgres = require('postgres')
const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: 'require', prepare: false })

const rows = await sql`SELECT id, emirates_id, passport_number FROM persons`
const eidMap = new Map(), ppMap = new Map(), updates = []
for (const r of rows) {
  const eh = eidHash(decrypt(r.emirates_id))
  const ph = ppHash(decrypt(r.passport_number))
  if (eh) eidMap.set(eh, (eidMap.get(eh) ?? 0) + 1)
  if (ph) ppMap.set(ph, (ppMap.get(ph) ?? 0) + 1)
  updates.push({ id: r.id, eh, ph })
}
const eidDups = [...eidMap.values()].filter(c => c > 1).length
const ppDups  = [...ppMap.values()].filter(c => c > 1).length
console.log(`persons scanned: ${rows.length}`)
console.log(`emirates-id duplicate groups: ${eidDups}`)
console.log(`passport duplicate groups:   ${ppDups}`)

if (REPORT_ONLY) { console.log('REPORT_ONLY — no writes performed.'); await sql.end(); process.exit(eidDups + ppDups > 0 ? 2 : 0) }
if (eidDups + ppDups > 0) { console.error('ABORT: resolve duplicates before backfill (rerun with REPORT_ONLY=true to monitor).'); await sql.end(); process.exit(2) }

let written = 0
for (const u of updates) {
  await sql`UPDATE persons SET emirates_id_hash = ${u.eh}, passport_number_hash = ${u.ph} WHERE id = ${u.id}`
  written++
}
console.log(`hashes written: ${written}`)
await sql.end()
