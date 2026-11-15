#!/usr/bin/env node
/**
 * AVANIIS HCM — Vercel Log Drain Setup Script
 *
 * Wires the AVANIIS production/staging Vercel project to an external
 * observability sink (Axiom, Datadog, or a custom HTTPS endpoint) by
 * creating a Vercel Log Drain via the Vercel REST API.
 *
 * Usage:
 *
 *   # Axiom (recommended for Vercel — native integration)
 *   VERCEL_TOKEN=<your-vercel-token> \
 *   AXIOM_DATASET=avaniis-prod \
 *   AXIOM_TOKEN=<axiom-ingest-token> \
 *   node scripts/setup-log-drain.mjs --sink=axiom --project=avaniis-hr
 *
 *   # Datadog
 *   VERCEL_TOKEN=<your-vercel-token> \
 *   DATADOG_API_KEY=<datadog-api-key> \
 *   node scripts/setup-log-drain.mjs --sink=datadog --project=avaniis-hr
 *
 *   # Custom HTTPS endpoint (PagerDuty, Opsgenie, Slack, etc.)
 *   VERCEL_TOKEN=<your-vercel-token> \
 *   TARGET_URL=https://hooks.example.com/avaniis-logs \
 *   TARGET_TOKEN=<bearer-token> \
 *   node scripts/setup-log-drain.mjs --sink=custom --project=avaniis-hr
 *
 *   # Dry-run (print the API payload without sending)
 *   node scripts/setup-log-drain.mjs --sink=axiom --dry-run
 *
 * Prerequisites:
 *   - VERCEL_TOKEN: a Vercel API token with project write scope
 *     (create at https://vercel.com/account/tokens)
 *   - VERCEL_ORG_ID (optional): your Vercel org/team ID
 *     (from https://vercel.com/<team>/settings — General → Team ID)
 *
 * What it does:
 *   1. Resolves the Vercel project ID from --project flag
 *   2. Builds the log drain payload with the chosen sink endpoint and auth header
 *   3. POSTs to /v2/integrations/log-drains (Vercel Integrations API)
 *   4. Prints the created drain ID and verification steps
 *
 * Security:
 *   - Never hard-codes any token or API key
 *   - All secrets consumed from environment variables
 *   - Dry-run mode available to verify payload before sending
 *
 * Alert definitions: tests/roadmap/alerting-strategy.md
 * Observability design: tests/roadmap/observability-foundation.md
 */

import { parseArgs } from 'node:util'

// ── CLI arg parsing ──────────────────────────────────────────────────────────

const { values: args } = parseArgs({
  options: {
    sink:      { type: 'string',  default: 'axiom'   }, // axiom | datadog | custom
    project:   { type: 'string',  default: 'avaniis-hr' },
    env:       { type: 'string',  default: 'production' }, // production | preview | development
    'dry-run': { type: 'boolean', default: false       },
    quiet:     { type: 'boolean', default: false       },
  },
  strict: false,
})

const sink    = args.sink
const project = args.project
const env     = args.env
const dryRun  = args['dry-run']
const quiet   = args.quiet

function log(msg) { if (!quiet) console.log(msg) }
function err(msg) { console.error(`[setup-log-drain] ERROR: ${msg}`); process.exit(1) }

// ── Sink endpoint resolution ─────────────────────────────────────────────────

let TARGET_URL
let authHeader

switch (sink) {
  case 'axiom': {
    const dataset = process.env.AXIOM_DATASET
    const token   = process.env.AXIOM_TOKEN
    if (!dataset) err('AXIOM_DATASET env var is required for --sink=axiom')
    if (!token  ) err('AXIOM_TOKEN env var is required for --sink=axiom')
    TARGET_URL  = `https://api.axiom.co/v1/datasets/${dataset}/ingest`
    authHeader  = `Bearer ${token}`
    log(`[setup-log-drain] Sink: Axiom dataset '${dataset}'`)
    break
  }

  case 'datadog': {
    const apiKey = process.env.DATADOG_API_KEY
    const site   = process.env.DATADOG_SITE ?? 'datadoghq.com'
    if (!apiKey) err('DATADOG_API_KEY env var is required for --sink=datadog')
    TARGET_URL = `https://http-intake.logs.${site}/api/v2/logs`
    authHeader = `DD-API-KEY ${apiKey}`
    log(`[setup-log-drain] Sink: Datadog (${site})`)
    break
  }

  case 'custom': {
    const url   = process.env.TARGET_URL
    const token = process.env.TARGET_TOKEN ?? ''
    if (!url) err('TARGET_URL env var is required for --sink=custom')
    TARGET_URL = url
    authHeader = token ? `Bearer ${token}` : undefined
    log(`[setup-log-drain] Sink: custom endpoint ${url}`)
    break
  }

  default:
    err(`Unknown sink: '${sink}'. Valid options: axiom | datadog | custom`)
}

// ── Vercel API payload ───────────────────────────────────────────────────────
//
// Vercel Log Drains API:
//   POST /v2/integrations/log-drains
//   https://vercel.com/docs/rest-api/endpoints/log-drains#create-a-log-drain
//
// The drain POSTs newline-delimited JSON to TARGET_URL on every log line
// emitted to stdout by the project's serverless functions.

const drainName = `avaniis-${env}-${sink}-drain`

const payload = {
  name:        drainName,
  url:         TARGET_URL,
  sources:     ['static', 'lambda', 'build', 'edge'],  // capture all log sources
  deliveryFormat: 'ndjson',   // matches logger.ts production output format
  headers:     authHeader
    ? { Authorization: authHeader }
    : undefined,
  projectIds:  [],  // populated after project ID resolution (see below)
  environments: env === 'production'
    ? ['production']
    : env === 'preview'
    ? ['preview']
    : ['development'],
}

// ── Dry-run ──────────────────────────────────────────────────────────────────

if (dryRun) {
  const safePayload = { ...payload }
  if (safePayload.headers?.Authorization) {
    safePayload.headers = { Authorization: '[REDACTED]' }
  }
  log('\n[setup-log-drain] DRY RUN — payload that would be sent:')
  log(JSON.stringify(safePayload, null, 2))
  log('\n[setup-log-drain] Run without --dry-run to send.')
  process.exit(0)
}

// ── Vercel API call ──────────────────────────────────────────────────────────

const VERCEL_TOKEN  = process.env.VERCEL_TOKEN
const VERCEL_ORG_ID = process.env.VERCEL_ORG_ID

if (!VERCEL_TOKEN) {
  err(
    'VERCEL_TOKEN is required.\n' +
    '  Create a token at: https://vercel.com/account/tokens\n' +
    '  Scope: Full Account (or project write)',
  )
}

/**
 * Makes an authenticated request to the Vercel REST API.
 */
async function vercelAPI(method, endpoint, body) {
  const url = `https://api.vercel.com${endpoint}${VERCEL_ORG_ID ? `?teamId=${VERCEL_ORG_ID}` : ''}`

  const response = await fetch(url, {
    method,
    headers: {
      Authorization:  `Bearer ${VERCEL_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    const message = data?.error?.message ?? data?.message ?? response.statusText
    err(`Vercel API ${method} ${endpoint} → ${response.status}: ${message}`)
  }

  return data
}

// Step 1: Resolve project ID
log(`\n[setup-log-drain] Resolving Vercel project: ${project} …`)
const projectData = await vercelAPI('GET', `/v9/projects/${project}`)
const projectId   = projectData?.id

if (!projectId) err(`Could not resolve project ID for '${project}'`)
log(`[setup-log-drain] Project ID: ${projectId}`)

// Step 2: Check for existing drain with the same name to avoid duplicates
log('[setup-log-drain] Checking for existing drain …')
const existing = await vercelAPI('GET', `/v2/integrations/log-drains`)
const duplicate = (existing?.logDrains ?? []).find(d => d.name === drainName)

if (duplicate) {
  log(`[setup-log-drain] Drain '${drainName}' already exists (id: ${duplicate.id}).`)
  log('[setup-log-drain] Deleting existing drain before recreating …')
  await vercelAPI('DELETE', `/v1/integrations/log-drains/${duplicate.id}`)
  log('[setup-log-drain] Existing drain deleted.')
}

// Step 3: Create the drain
payload.projectIds = [projectId]

log('[setup-log-drain] Creating log drain …')
const created = await vercelAPI('POST', '/v2/integrations/log-drains', payload)

// ── Success output ───────────────────────────────────────────────────────────

log('\n[setup-log-drain] ✅ Log drain created successfully!\n')
log(`  Drain ID:    ${created?.id ?? 'unknown'}`)
log(`  Drain name:  ${drainName}`)
log(`  Project:     ${project} (${projectId})`)
log(`  Sink:        ${sink} → ${TARGET_URL}`)
log(`  Environment: ${env}`)
log(`  Sources:     ${payload.sources.join(', ')}`)
log(`  Format:      ${payload.deliveryFormat}`)

log('\n[setup-log-drain] Verification steps:')
log('  1. Deploy a change to trigger a log line')
log(`  2. Check the drain endpoint for incoming JSON events`)
log(`  3. Query: { "level": "info", "svc": "process-driver" } in your sink`)
log(`  4. Set up alert rules from: tests/roadmap/alerting-strategy.md`)
log('\n[setup-log-drain] Alert setup reference:')
log('  ALT-001 (DB unavailable):        level:error  svc:health-db')
log('  ALT-004 (ARIA stream error):      level:error  svc:aria-chat  msg:"stream error"')
log('  ALT-005 (Cron tick fatal):        level:error  msg:"tick fatal"')
log('  ALT-007 (ARIA latency >3 000ms):  level:warn   svc:aria-chat  msg:"slow ARIA response"')
log('  ALT-008 (Cron slow tick >5 000ms):level:warn   msg:"slow tick"')
log('  ALT-009 (Outbox backlog):         level:warn   svc:outbox-poller  msg:"queue at batch limit"')
log('\n  See tests/roadmap/alerting-strategy.md for all 13 alert definitions.')
