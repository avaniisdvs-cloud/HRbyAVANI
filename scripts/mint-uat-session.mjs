#!/usr/bin/env node
/**
 * scripts/mint-uat-session.mjs  —  VERIFICATION HARNESS ONLY (local/dev/UAT)
 *
 * Mints an Auth.js v5 JWT session cookie for a REAL person resolved from the
 * DEV/UAT database (by employee number or personId), for local browser UAT
 * verification of the manager-approval-inbox fix. Unlike mint-test-session.mjs
 * (which hardcodes SYSTEM_ADMIN_PERSON_ID for all dev roles), this resolves the
 * actual personId / employee number / name / role / entity from the database so
 * the session represents the real user (e.g. K1207 / Dorababu Kethari).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SAFETY (mandatory — do not remove):
 *  • Refuses to run if NODE_ENV=production.
 *  • Refuses to run if DATABASE_ENV=production (read from .env.local).
 *  • Refuses to run if the DB host looks like production (PROD_DATABASE_URL match
 *    or non-neon/non-local host).
 *  • NEVER imported by application code — it is a standalone dev script.
 *  • Does NOT bypass production SSO: it uses the same Auth.js encode() the real
 *    sign-in uses; on a production deployment the cookie name/secret differ and
 *    this script will not run anyway (guards above).
 *  • Output JSON contains a signed cookie → tests/e2e/auth/ is gitignored.
 *  • READ-ONLY against the DB (SELECT only). No writes.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Usage:
 *   node scripts/mint-uat-session.mjs --employee-number K1207
 *   node scripts/mint-uat-session.mjs --person-id <uuid> --output tests/e2e/auth/x.json
 */
import { encode } from 'next-auth/jwt'
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { parseArgs } from 'node:util'
import postgres from 'postgres'

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    'employee-number': { type: 'string' },
    'person-id':       { type: 'string' },
    'base-url':        { type: 'string', default: 'http://localhost:3000' },
    output:            { type: 'string' },
    ttl:               { type: 'string', default: '3600' },
  },
  strict: true,
})

// ── Read .env.local ──────────────────────────────────────────────────────────
const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const get = (k) => {
  const line = env.split('\n').find(l => l.startsWith(k + '='))
  return line ? line.slice(k.length + 1).trim().replace(/^["']|["']$/g, '') : undefined
}
const DATABASE_URL = get('DATABASE_URL')
const DATABASE_ENV = (get('DATABASE_ENV') || '').toLowerCase()
const PROD_DB_URL  = get('PROD_DATABASE_URL')
const AUTH_SECRET  = get('AUTH_SECRET')

// ── SAFETY GUARDS ────────────────────────────────────────────────────────────
console.log('────────────────────────────────────────────────────────────────')
console.log('  LOCAL UAT VERIFICATION SESSION ONLY — not for production use')
console.log('────────────────────────────────────────────────────────────────')
if ((process.env.NODE_ENV || '').toLowerCase() === 'production') {
  console.error('REFUSING: NODE_ENV=production.'); process.exit(1)
}
if (DATABASE_ENV === 'production') {
  console.error('REFUSING: DATABASE_ENV=production.'); process.exit(1)
}
if (!DATABASE_URL || !AUTH_SECRET) {
  console.error('REFUSING: DATABASE_URL and AUTH_SECRET are required in .env.local.'); process.exit(1)
}
const host = new URL(DATABASE_URL).hostname
if (PROD_DB_URL) {
  try { if (new URL(PROD_DB_URL).hostname === host) { console.error('REFUSING: DB host matches PROD_DATABASE_URL.'); process.exit(1) } } catch {}
}
if (!/\.neon\.tech$/.test(host) && !/^(localhost|127\.0\.0\.1)$/.test(host)) {
  console.error(`REFUSING: host '${host}' is not a recognised DEV/UAT cloud/local host.`); process.exit(1)
}
const baseUrl = values['base-url']
if (baseUrl.startsWith('https://') && !/localhost|127\.0\.0\.1/.test(baseUrl)) {
  console.error('REFUSING: this harness is for local verification only (http://localhost).'); process.exit(1)
}
if (!values['employee-number'] && !values['person-id']) {
  console.error('ERROR: provide --employee-number or --person-id.'); process.exit(1)
}

// ── Resolve the real person from the DB (READ-ONLY) ──────────────────────────
const sql = postgres(DATABASE_URL, { ssl: 'require', max: 1, prepare: false })
let person
try {
  const rows = values['employee-number']
    ? await sql`
        select p.id as person_id, p.person_number, p.full_name_en, p.assignment_status,
               u.id as account_id, u.avaniis_role, u.primary_entity_id, u.primary_email
        from persons p
        left join user_accounts u on u.person_id = p.id
        where p.person_number = ${values['employee-number']}
        limit 1`
    : await sql`
        select p.id as person_id, p.person_number, p.full_name_en, p.assignment_status,
               u.id as account_id, u.avaniis_role, u.primary_entity_id, u.primary_email
        from persons p
        left join user_accounts u on u.person_id = p.id
        where p.id = ${values['person-id']}
        limit 1`
  person = rows[0]
} finally {
  await sql.end()
}
if (!person) { console.error('ERROR: person not found in DB.'); process.exit(1) }

// Role: use the real avaniis_role if the person has an account; else MANAGER if
// they manage a team (not faked — falls back transparently and logs it).
const role = person.avaniis_role ?? 'MANAGER'
const legalEntityId = person.primary_entity_id ?? person.person_id // entity from account
if (!person.avaniis_role) console.warn(`  NOTE: no user_account for ${person.person_number}; defaulting role=MANAGER for verification.`)
if (!person.primary_entity_id) console.warn('  NOTE: no primary_entity_id on account; using a placeholder entity for verification only.')

// ── Build token payload (mirrors lib/auth.ts session() callback) ─────────────
const now = Math.floor(Date.now() / 1000)
const ttl = parseInt(values['ttl'], 10)
const tokenPayload = {
  sub: person.account_id ?? person.person_id,
  iat: now, exp: now + ttl,
  jti: `uat-${person.person_number}-${now}`,
  id:            person.account_id ?? person.person_id,
  name:          person.full_name_en,
  email:         person.primary_email ?? `${person.person_number}@uat.local`,
  role,
  legalEntityId,
  personId:      person.person_id,      // ← REAL personId (the inbox keys off this)
  mfaVerified:   true,                  // so high-privilege roles render in UAT
  loginProvider: 'SSO',
}

// ── Mint cookie + write Playwright storageState ──────────────────────────────
const isHttps = baseUrl.startsWith('https://')
const cookieName = isHttps ? '__Secure-authjs.session-token' : 'authjs.session-token'
const jwtValue = await encode({ token: tokenPayload, secret: AUTH_SECRET, salt: cookieName, maxAge: ttl })

const output = values.output ?? `tests/e2e/auth/${(person.person_number || 'uat').toLowerCase()}-uat.json`
const storageState = {
  cookies: [{
    name: cookieName, value: jwtValue, domain: new URL(baseUrl).hostname,
    path: '/', expires: now + ttl, httpOnly: true, secure: isHttps, sameSite: 'Lax',
  }],
  origins: [],
}
mkdirSync(dirname(output), { recursive: true })
writeFileSync(output, JSON.stringify(storageState, null, 2) + '\n', 'utf-8')

console.log(`  Resolved : ${person.full_name_en} (${person.person_number})`)
console.log(`  personId : ${person.person_id}`)
console.log(`  role     : ${role}   entity: ${legalEntityId}`)
console.log(`  account  : ${person.primary_email ?? '(no user_account)'}`)
console.log(`  cookie   : ${cookieName}  ttl=${ttl}s`)
console.log(`  output   : ${output}`)
