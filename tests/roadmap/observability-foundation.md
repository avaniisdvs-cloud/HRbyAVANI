# AVANIIS HCM — Observability Foundation
## Phase 2 Task 7 Design Document

> Implemented: 2026-05-23  
> Status: **COMPLETE ✅**  
> Validation: `pnpm typecheck` → 0 errors | `pnpm build` → 112 pages ✅

---

## 1. Overview

This document describes the observability layer implemented for AVANIIS HCM in Phase 2 Task 7. The design follows a **Vercel-native, zero-dependency** approach — structured JSON to stdout is captured by Vercel's log infrastructure and forwarded to external systems via Log Drain without requiring a sidecar agent, OpenTelemetry collector, or separate logging service.

### Design principles

| Principle | Implementation |
|---|---|
| **PII-safe by default** | 30+ sensitive field names auto-redacted at emit time |
| **Zero dependency overhead** | No OpenTelemetry, Datadog agent, or external SDK in hot path |
| **Request correlation end-to-end** | `x-request-id` UUID generated at Edge middleware, propagated to all downstream calls |
| **Slow-path alerting** | Named thresholds (SLOW_PAGE_MS, SLOW_API_MS, etc.) produce `warn` logs Vercel can alert on |
| **Vercel-compatible** | JSON to `process.stdout.write` captured by Vercel platform automatically |

---

## 2. Architecture

```
Client Request
     │
     ▼
┌─────────────────────────────────────────────────────────────┐
│  middleware.ts (Edge)                                        │
│  • Generate / pass-through x-request-id (crypto.randomUUID) │
│  • Inject into request headers for downstream consumption    │
│  • Echo in every response header                            │
└────────────────────────┬────────────────────────────────────┘
                         │
           ┌─────────────┼─────────────┐
           ▼             ▼             ▼
     API Routes     Cron Routes   Background Jobs
     (aria/chat)  (workflow-sla,  (process-driver
                  probation)       outbox poller)
           │             │             │
           └─────────────┼─────────────┘
                         ▼
                  lib/logger.ts
                  • PII redaction
                  • JSON → stdout (prod)
                  • Coloured console (dev)
                  • logger.{info,warn,error,fatal}

                  lib/telemetry.ts
                  • startTimer() → performance.now()
                  • withTiming() wrapper
                  • buildServerTiming() → Server-Timing header
                  • Threshold constants
```

---

## 3. Core Infrastructure

### 3.1 `lib/logger.ts`

Structured logger with PII field redaction.

**Log levels:** `debug | info | warn | error | fatal`

**Log record format (JSON, production):**
```json
{
  "ts": "2026-05-23T07:00:00.000Z",
  "level": "info",
  "svc": "aria-chat",
  "msg": "stream complete",
  "reqId": "550e8400-e29b-41d4-a716-446655440000",
  "durationMs": 1243,
  "role": "HR_ADMIN",
  "turnCount": 3,
  "model": "claude-opus-4-5",
  "inputTokens": 1200,
  "outputTokens": 340
}
```

**PII field redaction (30+ fields):**
All of the following are replaced with `[REDACTED]` before any record is emitted:
`email`, `password`, `passwordHash`, `token`, `secret`, `apiKey`, `api_key`,
`accessToken`, `access_token`, `refreshToken`, `iban`, `bankAccount`,
`emiratesId`, `emirates_id`, `passportNumber`, `passport_number`, `phone`,
`mobile`, `dob`, `dateOfBirth`, `salary`, `authorization`, `cookie`,
`CRON_SECRET`, `AUTH_SECRET`, `ANTHROPIC_API_KEY`, `FIELD_ENCRYPTION_KEY`,
`AZURE_STORAGE_SAS_TOKEN`, `AZURE_AD_CLIENT_SECRET`, `set-cookie`,
`x-auth-token`, `x-api-key`

**Dev output (coloured):**
```
[INFO]  aria-chat stream complete {"reqId":"...","totalMs":1243,"role":"HR_ADMIN"}
[WARN]  outbox-poller slow tick {"durationMs":2100}
[ERROR] aria-chat stream error {"errType":"RateLimitError","error":"Rate limit..."}
```

**`getReqId()` helper:**  
Async function that reads `x-request-id` from `next/headers` — usable in Server Actions and API routes.

### 3.2 `lib/telemetry.ts`

Performance timing utilities and slow-path thresholds.

**Threshold constants:**

| Constant | Value | Usage |
|---|---|---|
| `SLOW_PAGE_MS` | 1,500ms | Page Server Component render time |
| `SLOW_API_MS` | 400ms | API route response time |
| `SLOW_QUERY_MS` | 200ms | Individual DB query |
| `SLOW_ARIA_MS` | 3,000ms | ARIA Claude API full response |
| `SLOW_JOB_MS` | 5,000ms | Cron job tick execution |
| `SLOW_OUTBOX_TICK_MS` | 2,000ms | Outbox poller single tick |

**`startTimer()` → `{ elapsedMs() }`:**
Uses `performance.now()` — works in Node.js and Vercel Edge runtime. Sub-millisecond precision.

**`withTiming(fn)` → `{ result, durationMs }`:**
Wraps any async function to capture total execution time.

**`buildServerTiming(timings)` → string:**
Builds a `Server-Timing` header value from a `Record<string, number>`.
Example: `"db;dur=23, aria;dur=1420, total;dur=1498"`

---

## 4. Instrumented Components

### 4.1 Request Correlation (OBS-003) — `middleware.ts`

Every HTTP request passing through the Edge middleware receives:
1. An `x-request-id` header (reused from upstream proxy, or generated as `crypto.randomUUID()`)
2. The ID injected into downstream request headers via `NextResponse.next({ request: { headers } })`
3. The ID echoed in the response `x-request-id` header

This links logs across: middleware → API route → Server Action → background job.

### 4.2 Health Endpoints

**`GET /api/health`** — basic liveness probe:
```json
{ "ok": true, "service": "avaniis-hcm", "timestamp": "...", "responseMs": 2 }
```

**`GET /api/health/db`** (OBS-002) — Neon DB connectivity probe:
```json
{ "status": "ok", "dbMs": 14, "timestamp": "...", "region": "fra1" }
```
Returns `503` on DB failure with `{ "status": "error", "error": "Database unavailable" }`.

### 4.3 ARIA Chat — `app/api/aria/chat/route.ts`

Logs emitted per request:
- `[INFO] aria-chat stream start` — role, turnCount, model, maxTokens, userAgent
- `[INFO] aria-chat stream complete` — totalMs, streamStartMs, inputTokens, outputTokens, stopReason
- `[WARN] aria-chat slow ARIA response` — when totalMs > SLOW_ARIA_MS (3,000ms)
- `[ERROR] aria-chat stream error` — errType, truncated message (max 300 chars)

PII guarantee: only `role` logged (e.g. `HR_ADMIN`), never email, name, or session content.

### 4.4 Workflow SLA Cron (OBS-004) — `app/api/cron/workflow-sla/route.ts`

Logs emitted per tick:
- `[INFO] cron-workflow-sla tick start` — reqId
- `[INFO] cron-workflow-sla tick complete` — reqId, durationMs, processed, errors
- `[WARN] cron-workflow-sla slow tick` — when durationMs > SLOW_JOB_MS (5,000ms)
- `[WARN] cron-workflow-sla tick had errors` — when result.errors > 0
- `[ERROR] cron-workflow-sla tick fatal` — durationMs, truncated error

Response now includes `durationMs` field.

### 4.5 Probation Alerts Cron — `app/api/cron/probation-alerts/route.ts`

Logs emitted per tick:
- `[WARN] cron-probation-alerts unauthorized cron invocation`
- `[INFO] cron-probation-alerts tick start` — reqId
- `[INFO] cron-probation-alerts tick complete` — reqId, durationMs, alerted count
- `[WARN] cron-probation-alerts slow tick` — when durationMs > SLOW_JOB_MS
- `[ERROR] cron-probation-alerts tick fatal` — durationMs, truncated error

Response now includes `durationMs` field.

### 4.6 Events Outbox Poller (OBS-005) — `lib/jobs/process-driver.ts`

Logs emitted per tick:
- `[WARN] outbox-poller queue at batch limit — possible backlog` — queueDepth, maxRetryRows
- `[WARN] outbox-poller slow tick` — when durationMs > SLOW_OUTBOX_TICK_MS (2,000ms)
- `[ERROR] outbox-poller tick error` — durationMs, truncated error (max 200 chars)
- `[INFO] process-driver all background jobs started` — lists all 6 job names

---

## 5. Coverage Matrix

| OBS ID | Component | Capability | Status |
|---|---|---|---|
| OBS-001 | `lib/logger.ts` | Structured JSON logging + PII redaction | ✅ Implemented |
| OBS-002 | `app/api/health/db/route.ts` | Neon DB connectivity probe | ✅ Implemented |
| OBS-003 | `middleware.ts` | Request correlation ID end-to-end | ✅ Implemented |
| OBS-004 | `app/api/cron/workflow-sla/route.ts` | SLA cron timing + slow-path alerts | ✅ Implemented |
| OBS-005 | `lib/jobs/process-driver.ts` | Outbox queue depth + slow tick alerts | ✅ Implemented |
| OBS-006 | `lib/telemetry.ts` | Performance timing utilities + thresholds | ✅ Implemented |
| OBS-007 | `app/api/aria/chat/route.ts` | ARIA token usage + latency tracking | ✅ Implemented |

---

## 6. Vercel Integration

### Log Drain setup (external systems)

All structured logs flow to Vercel's log infrastructure automatically (stdout capture). To forward to Datadog, Axiom, Logtail, or another system:

1. Vercel Dashboard → Project → Settings → Log Drains
2. Add HTTPS endpoint for your logging system
3. Filter on `level=warn` or `level=error` for alerting

### Recommended Vercel alerts (free tier)

| Alert | Trigger |
|---|---|
| DB health degraded | `/api/health/db` returns non-200 |
| ARIA latency high | Log contains `"slow ARIA response"` |
| Outbox backlog | Log contains `"queue at batch limit"` |
| Cron failure | Log contains `"tick fatal"` |

---

## 7. Security Constraints

All implementations comply with Task 7 hard constraints:

- ✅ No PII in logs — field-name redaction covers 30+ sensitive fields
- ✅ No secrets/tokens logged — `CRON_SECRET`, `AUTH_SECRET`, `ANTHROPIC_API_KEY`, `FIELD_ENCRYPTION_KEY` all in PII_FIELDS set
- ✅ No significant performance degradation — `performance.now()` timing adds <0.1ms per call; `logger.info()` is synchronous JSON serialisation (microseconds)
- ✅ Every addition validated — `pnpm typecheck` → 0 errors; `pnpm build` → 112 pages

---

## 8. Validation Results

| Check | Result |
|---|---|
| `pnpm typecheck` | ✅ 0 errors |
| `pnpm build` | ✅ 112 pages, 0 errors |
| Pre-existing warnings | `<a>` element and `<img>` element warnings — pre-existing, unrelated to observability |

---

## 9. Files Changed

| File | Action | Change |
|---|---|---|
| `lib/logger.ts` | **CREATED** | Structured logger, PII redaction, JSON/coloured output, `getReqId()` |
| `lib/telemetry.ts` | **CREATED** | `startTimer()`, `withTiming()`, `buildServerTiming()`, 6 threshold constants |
| `middleware.ts` | **MODIFIED** | OBS-003: `x-request-id` generation + propagation to all responses |
| `app/api/health/route.ts` | **MODIFIED** | Added `responseMs` + `region` fields to response |
| `app/api/health/db/route.ts` | **CREATED** | OBS-002: Neon DB probe endpoint with 200/503 |
| `app/api/aria/chat/route.ts` | **MODIFIED** | Full timing + structured logging + token tracking |
| `app/api/cron/workflow-sla/route.ts` | **MODIFIED** | OBS-004: tick timing + structured logging |
| `app/api/cron/probation-alerts/route.ts` | **MODIFIED** | Tick timing + structured logging |
| `lib/jobs/process-driver.ts` | **MODIFIED** | OBS-005: queue depth warning + slow tick alerts |
| `tests/roadmap/observability-foundation.md` | **CREATED** | This document |
| `tests/roadmap/alerting-strategy.md` | **CREATED** | Alerting thresholds + escalation |
