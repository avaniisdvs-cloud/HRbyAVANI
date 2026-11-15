# AVANIIS HCM — Alerting Strategy
## Phase 2 Task 7

> Created: 2026-05-23  
> Status: **DESIGNED ✅**  
> Architecture: Vercel Log Drains + structured JSON logs from `lib/logger.ts`

---

## 1. Alert Architecture

```
lib/logger.ts (warn/error/fatal)
        │
        ▼
process.stdout (JSON lines)
        │
        ▼
Vercel Log Capture (automatic)
        │
        ├─── Vercel Dashboard Alerts (built-in)
        │
        └─── Vercel Log Drain (HTTPS POST)
                    │
                    ├── Datadog  (enterprise)
                    ├── Axiom    (recommended for Vercel)
                    ├── Logtail  (BetterStack)
                    └── Custom webhook (PagerDuty / Opsgenie)
```

---

## 2. Severity Levels

| Severity | Logger Level | Response SLA | Escalation |
|---|---|---|---|
| **P1 — Critical** | `fatal` | Immediate (< 5 min) | PagerDuty page on-call |
| **P2 — High** | `error` | 15 minutes | Slack `#alerts-critical` |
| **P3 — Warning** | `warn` | 1 hour | Slack `#alerts-warn` |
| **P4 — Info** | `info` | Next business day | Dashboard review |

---

## 3. Alert Definitions

### 3.1 P1 — Critical Alerts (immediate page)

#### ALT-001 · Database Unavailable
- **Trigger:** `GET /api/health/db` returns HTTP 503
- **Threshold:** 2 consecutive failures within 5 minutes
- **Logger pattern:** `"level":"error","svc":"health-db","msg":"DB probe failed"`
- **Action:** Page on-call; check Neon dashboard eu-central-1; check `POSTGRES_URL` env var
- **Recovery:** `/api/health/db` returns 200 for 2 consecutive checks

#### ALT-002 · Auth Service Down
- **Trigger:** `GET /api/auth/session` returns 5xx
- **Threshold:** 3 failures within 2 minutes
- **Logger pattern:** `"level":"fatal"` (any)
- **Action:** Page on-call; check Microsoft Entra ID tenant status; check `AUTH_SECRET` env var
- **Recovery:** Auth endpoint returns 200

#### ALT-003 · Process Driver Crash
- **Trigger:** Background cron jobs stop emitting logs for > 20 minutes
- **Logger pattern:** `"svc":"process-driver","msg":"all background jobs started"` not seen after deploy
- **Action:** Check Vercel function logs; restart if serverless instance recycled; check `worker.ts` entry point

---

### 3.2 P2 — High Alerts (15-minute response)

#### ALT-004 · ARIA API Fatal Error
- **Trigger:** ARIA chat route returns 502
- **Threshold:** > 5 occurrences in 10 minutes
- **Logger pattern:** `"level":"error","svc":"aria-chat","msg":"stream error"`
- **Action:** Check Anthropic API status page; verify `ANTHROPIC_API_KEY` is valid; check rate limits
- **Recovery:** Error rate drops below 1/min

#### ALT-005 · Cron Job Fatal
- **Trigger:** Any cron tick emits `tick fatal` log
- **Logger pattern:** `"msg":"tick fatal"` from any `svc` matching `cron-*`
- **Action:** Check Vercel cron execution logs; verify `CRON_SECRET` env var; check DB connectivity
- **Recovery:** Next tick completes without fatal

#### ALT-006 · Outbox Poller Error Loop
- **Trigger:** Outbox poller emits error on 3 consecutive ticks (10s each = 30 seconds)
- **Logger pattern:** `"level":"error","svc":"outbox-poller","msg":"tick error"` repeated
- **Action:** Check `events` table for corrupted rows; check DB health; check `dispatchEvent` handlers
- **Recovery:** Successful tick without error

---

### 3.3 P3 — Warning Alerts (1-hour response)

#### ALT-007 · ARIA Latency High
- **Trigger:** `"msg":"slow ARIA response"` — totalMs > 3,000ms
- **Threshold:** > 3 occurrences in 15 minutes
- **Logger pattern:** `"level":"warn","svc":"aria-chat","msg":"slow ARIA response","totalMs":`
- **Action:** Review Anthropic API latency; consider reducing `maxTokens`; check request size
- **Threshold constant:** `SLOW_ARIA_MS = 3_000`

#### ALT-008 · Cron Job Slow
- **Trigger:** Cron tick duration > 5,000ms
- **Logger pattern:** `"level":"warn","msg":"slow tick"` from `cron-workflow-sla` or `cron-probation-alerts`
- **Action:** Review SQL query plans in Neon; check for missing indexes; check batch size
- **Threshold constant:** `SLOW_JOB_MS = 5_000`

#### ALT-009 · Outbox Backlog Building
- **Trigger:** `"msg":"queue at batch limit — possible backlog"` — queueDepth >= 50
- **Logger pattern:** `"level":"warn","svc":"outbox-poller","msg":"queue at batch limit"`
- **Action:** Check `events` table; look for failed dispatches with high retry_count; scale batch size if needed
- **Check query:**
  ```sql
  SELECT event_type, COUNT(*), MAX(retry_count), MIN(created_at)
  FROM events WHERE processed_at IS NULL
  GROUP BY event_type ORDER BY COUNT(*) DESC;
  ```

#### ALT-010 · Outbox Slow Tick
- **Trigger:** Outbox poller tick > 2,000ms
- **Logger pattern:** `"level":"warn","svc":"outbox-poller","msg":"slow tick","durationMs":`
- **Action:** Review event dispatcher performance; check `dispatchEvent` for slow external calls
- **Threshold constant:** `SLOW_OUTBOX_TICK_MS = 2_000`

#### ALT-011 · SLA Breach Cron Errors
- **Trigger:** `result.errors > 0` in workflow SLA cron response
- **Logger pattern:** `"level":"warn","svc":"cron-workflow-sla","msg":"tick had errors"`
- **Action:** Review `workflow_instances` table; check for stuck instances; review error details in log

---

### 3.4 P4 — Informational (dashboard review)

#### ALT-012 · API Latency Trending High
- **Trigger:** `durationMs` consistently > 400ms in API routes
- **Logger pattern:** `"level":"warn","msg":"slow tick"` recurring multiple times per hour
- **Action:** Profile SQL queries; review N+1 patterns; consider caching
- **Threshold constant:** `SLOW_API_MS = 400`

#### ALT-013 · DB Probe Latency
- **Trigger:** `GET /api/health/db` returns `dbMs > 100`
- **Action:** Check Neon region latency; verify co-location with fra1; review connection pool settings

---

## 4. Escalation Matrix

| Alert | P1 | P2 | P3 |
|---|---|---|---|
| **First responder** | On-call engineer (PagerDuty) | Dev team lead | Assigned dev |
| **Escalation after** | 5 min no response | 30 min no resolution | End of business day |
| **Escalation to** | Engineering manager | CTO | Sprint backlog |
| **Notification channel** | PagerDuty + SMS | Slack `#alerts-critical` | Slack `#alerts-warn` |
| **Post-mortem required** | Yes (within 48h) | Yes (within 1 week) | No |

---

## 5. Monitoring Runbooks

### Runbook: DB health probe returns 503

```bash
# 1. Check Neon dashboard
# → https://console.neon.tech/app/projects → check eu-central-1

# 2. Test connectivity directly
curl -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3001/api/health/db

# 3. Check environment variable
# → Vercel Dashboard → Project → Settings → Environment Variables → POSTGRES_URL

# 4. Check DB pool settings in lib/db.ts
# → max: 1, ssl: require, idle_timeout: 20s
```

### Runbook: ARIA returns 502 stream errors

```bash
# 1. Check Anthropic status
# → https://status.anthropic.com

# 2. Test ARIA config
curl -H "Cookie: <session>" \
  http://localhost:3001/api/aria/chat \
  -d '{"messages":[{"role":"user","content":"hello"}]}'

# 3. Verify API key in Neon (AriaConfig table)
# → app/(hr-admin)/settings/aria page
```

### Runbook: Outbox backlog at batch limit

```sql
-- Check unprocessed events
SELECT event_type, COUNT(*), MAX(retry_count), MIN(created_at)
FROM events WHERE processed_at IS NULL
GROUP BY event_type;

-- Force-expire permanently-failed rows (after investigation)
UPDATE events
SET processed_at = NOW(), error_text = 'manually expired by ops'
WHERE processed_at IS NULL AND retry_count >= 5
  AND created_at < NOW() - INTERVAL '1 day';
```

---

## 6. Log Query Reference

For Vercel Log Drain → Axiom / Datadog, use these query patterns:

| Goal | Query |
|---|---|
| All errors in last 1h | `level:error OR level:fatal` |
| ARIA slow responses | `svc:aria-chat AND msg:"slow ARIA response"` |
| Cron failures | `svc:cron-* AND msg:"tick fatal"` |
| Outbox backlog | `svc:outbox-poller AND msg:"queue at batch limit"` |
| By request ID | `reqId:550e8400-*` (prefix match) |
| DB probe failures | `svc:health-db AND level:error` |
| Slow jobs (any) | `msg:"slow tick"` |

---

## 7. SLA Thresholds Reference

From `lib/telemetry.ts`:

```typescript
export const SLOW_PAGE_MS        = 1_500   // Page render > 1.5s → alert
export const SLOW_API_MS         = 400     // API response > 400ms → alert
export const SLOW_QUERY_MS       = 200     // DB query > 200ms → alert
export const SLOW_ARIA_MS        = 3_000   // ARIA response > 3s → alert
export const SLOW_JOB_MS         = 5_000   // Cron job tick > 5s → alert
export const SLOW_OUTBOX_TICK_MS = 2_000   // Outbox tick > 2s → alert
```

These thresholds are derived from the k6 NFR sign-off values (commit `a01dc1b`):
- NFR-01 page p95: 1,143ms → `SLOW_PAGE_MS` = 1,500ms (31% headroom)
- NFR-02 API p95: 294ms → `SLOW_API_MS` = 400ms (36% headroom)

---

## 8. Phase 2 Monitoring Gaps (Future Work)

| Gap | Priority | Phase |
|---|---|---|
| Real-time error rate dashboard (Vercel Analytics) | Medium | Phase 2 |
| DB query-level timing via Drizzle middleware hook | Medium | Phase 3 |
| Server-Timing headers on page routes | Low | Phase 3 |
| Synthetic uptime monitoring (Betterstack/Checkly) | High | Phase 2 |
| Distributed trace context propagation | Low | Phase 3 |
| Alert noise reduction (dedup window) | Medium | Phase 3 |
