# AVANIIS HCM — Chaos Testing Plan

> Last updated: 2026-05-22 (CHAOS-008 executed — 25/25 pass)
> CHAOS-007: EXECUTED ✅ | CHAOS-008: EXECUTED ✅ 25/25 PASS | CHAOS-009 (k6): EXECUTED ✅ 5/5 PASS

---

## Executed phases

### CHAOS-001 to 006 — Application-layer chaos
**Status: EXECUTED ✅ — 22/22 pass**  
**File:** `tests/chaos/resilience.test.ts`  
**Run:** `pnpm vitest run tests/chaos/resilience.test.ts`

| Test | What it verifies |
|---|---|
| CHAOS-001 | `writeAuditLog` propagates tx errors — audit-or-rollback holds |
| CHAOS-002 | AES-256-GCM tamper detection (empty, truncated, bit-flip) |
| CHAOS-003 | Effective-date arithmetic boundary invariants |
| CHAOS-004 | requireRole mock boundary matches production error contract |
| CHAOS-005 | Zod adversarial input validation (100k string, NaN, SQL injection) |
| CHAOS-006 | Config guards: BR-AL-001, system field protection, approver role validation |

---

### CHAOS-007 — DB outage simulation (Toxiproxy v2.12.0)
**Status: EXECUTED ✅ — 5/5 pass**  
**File:** `tests/chaos/toxiproxy.test.ts`

| Scenario | Toxic | Outcome |
|---|---|---|
| Connection timeout | `timeout` 100ms | Error in 104ms — no hang ✅ |
| TCP reset | `reset_peer` | `ECONNRESET` — pool recovered ✅ |
| Bandwidth throttle (1KB/s) | `bandwidth` rate=1 | Data integrity preserved ✅ |
| Full DB outage + recovery | proxy `enabled: false` | Error, then auto-recovery ✅ |

**Run (requires Toxiproxy + Docker Postgres):**
```bash
toxiproxy-server &
toxiproxy-cli create -l 0.0.0.0:25432 -u localhost:5433 postgres_chaos
pnpm vitest run tests/chaos/toxiproxy.test.ts
```

---

## CHAOS-008 — External service failure (Vitest integration suite)

**Status: EXECUTED ✅ — 25/25 PASS (2026-05-22)**  
**Approach:** Vitest integration tests mock the external service SDK clients (Anthropic SDK, nodemailer, Azure Blob) at the module boundary — no TLS proxy required. Each test verifies the application error-handling branch rather than actual service connectivity.

### Execution summary

| Sub-scenario | File | Tests | Result |
|---|---|---|---|
| CHAOS-008a — Claude/ARIA connectivity failures | `aria-resilience.test.ts` | 5 (C8A-001–005) | ✅ 5/5 PASS |
| CHAOS-008d — AI rate limit + malformed response | `aria-resilience.test.ts` | 6 (C8D-001–006) | ✅ 6/6 PASS |
| CHAOS-008b — Azure Blob upload failure | `blob-storage-chaos.test.ts` | 6 (C8B-001–006) | ✅ 6/6 PASS |
| CHAOS-008c — SMTP/notification outbox failure | `notification-outbox.test.ts` | 8 (C8C-001–008) | ✅ 8/8 PASS |
| **Total** | | **25** | **✅ 25/25 PASS** |

**Production code fix applied (CHAOS-008d):** `modules/aria/actions.ts` — added graceful handlers for `RateLimitError`, `APIConnectionError`, and `AuthenticationError` before the `translateError` catch-all. ARIA now returns a bilingual `AriaResponse` on provider failures instead of propagating an `AppError` throw to the chat UI.

### Why not Toxiproxy for CHAOS-008?
Toxiproxy v2 is a TCP proxy only — it cannot intercept HTTPS (Claude API, Azure Blob, SMTP with TLS). The staging-safe approach injects failures at the application configuration layer by pointing service clients at invalid endpoints and verifying the error handling branches.

---

### CHAOS-008a — Claude/ARIA API timeout

**Simulation method:** Set `ANTHROPIC_API_KEY=invalid_key_chaos_test` and `ANTHROPIC_BASE_URL=http://localhost:9999` (nothing listening) before the test run.

**Expected degradation:**
- ARIA chat panel shows error state UI: "AI assistant is temporarily unavailable"
- No crash, no blank page, no console errors that leak API credentials
- Person record and all other HR data remain completely unaffected
- Error is logged to audit trail with `channel: 'ARIA_TEXT'`

**Pass criteria:**
- `GET /me/aria` → 200 (page loads, shows error state)
- ARIA chat request → structured error JSON (not 500)
- No sensitive API key in response headers or body

**Test command:**
```bash
ANTHROPIC_API_KEY=invalid_chaos_test ANTHROPIC_BASE_URL=http://localhost:9999 \
  pnpm playwright test --project=employee -g "ARIA chat"
```

---

### CHAOS-008b — Azure Blob storage failure (photo upload)

**Simulation method:** Set `AZURE_STORAGE_ACCOUNT_NAME=invalid` and `AZURE_STORAGE_SAS_TOKEN=invalid` in the test run environment.

**Expected degradation:**
- `POST /api/persons/[id]/photo` → 503 with body `{"error":"STORAGE_UNAVAILABLE"}`
- Person record in Postgres remains intact — `profile_photo_url` stays at prior value (null or existing URL)
- No partial upload state, no orphaned blob references
- HR Admin sees a toast: "Photo upload failed — storage temporarily unavailable"

**Pass criteria:**
- Person `GET /api/persons/[id]` → 200 with correct data after failed photo upload
- `profile_photo_url` unchanged in DB after failed upload
- No 500/unhandled error on the page

**Test command:**
```bash
AZURE_STORAGE_ACCOUNT_NAME=invalid AZURE_STORAGE_SAS_TOKEN=invalid \
  pnpm playwright test --project=hr-admin -g "photo upload"
```

---

### CHAOS-008c — Email/notification provider failure

**Simulation method:** Set `SMTP_HOST=localhost` and `SMTP_PORT=9998` (nothing listening). The notification system uses a Postgres outbox pattern.

**Expected degradation:**
- Email delivery attempt fails silently
- Notification record remains in `notification_log` with `status = 'PENDING'` (not lost, not deleted)
- Next cron run retries delivery (outbox retry loop)
- HR workflow completes normally — no blocking on email delivery

**Pass criteria:**
```sql
-- After a leave approval with broken SMTP:
SELECT status, retry_count FROM notification_log
WHERE created_date > NOW() - INTERVAL '5 minutes'
ORDER BY created_date DESC;
-- Expected: status = 'PENDING', retry_count >= 1
```

**Test command:**
```bash
SMTP_HOST=localhost SMTP_PORT=9998 \
  pnpm vitest run tests/integration/notification-outbox.test.ts
```

---

### CHAOS-008d — AI provider rate limit (429 handling)

**Simulation method:** Mock the Anthropic SDK `messages.create` to return a `RateLimitError` (HTTP 429).

**Expected degradation:**
- ARIA chat responds with: `{"error":"AI_RATE_LIMITED","retryAfter":60}`
- Exponential backoff implemented in `modules/aria/` (see `aria/client.ts`)
- No crash, no hang, UI shows "Please try again in a moment"

**Pass criteria:**
```typescript
// In tests/integration/aria-resilience.test.ts
vi.mocked(anthropic.messages.create).mockRejectedValueOnce(
  new RateLimitError(429, {}, 'rate limit exceeded', new Headers())
)
const result = await handleAriaMessage('test prompt', session)
expect(result.error).toBe('AI_RATE_LIMITED')
expect(result.retryAfter).toBeGreaterThan(0)
```

---

### CHAOS-008 full execution checklist

- [x] CHAOS-008a: ARIA chat returns safe `AriaResponse` (not crash) when Claude API is unreachable — C8A-001–005 ✅
- [x] CHAOS-008b: Photo upload throws `AppError`; DB transaction NOT reached when blob upload fails; no orphaned records — C8B-001–006 ✅
- [x] CHAOS-008c: Notification stays in outbox as `PENDING` (not lost) when SMTP fails; `bulkSend` continues despite partial failures — C8C-001–008 ✅
- [x] CHAOS-008d: ARIA handles 429 rate limit gracefully (bilingual retry-after response, no throw) — C8D-001–006 ✅
- [x] Results logged in `tests/e2e/e2etestresults.md` (Entry 26)

---

## CHAOS-009 — k6 load test

**Status: EXECUTED ✅ — ALL 5 NFR THRESHOLDS PASS — SIGN-OFF ISSUED 2026-05-22**  
**Environment:** Vercel fra1 (Frankfurt) + Neon eu-central-1 (Frankfurt) — co-located  
**Commit:** `a01dc1b` · **VU:** 500 · **k6 exit code:** 0

| NFR | Staging result | Threshold | Verdict |
|---|---|---|---|
| NFR-01 page load p95 | **1,143ms** | < 2,000ms | ✅ PASS |
| NFR-02 API p95 | **294ms** | < 500ms | ✅ PASS |
| NFR-04 error rate | **0.0%** | < 1% | ✅ PASS |
| Checks pass rate | **99.8%** | > 95% | ✅ PASS |
| Overall p95 | **992ms** | < 3,000ms | ✅ PASS |

See `tests/performance/k6-results-staging.json` for the full result artifact and `tests/qa-final-status.md` for detailed findings.

---

## Running the full chaos suite

```bash
# CHAOS-001 to 006 — always runnable, no infrastructure needed
pnpm vitest run tests/chaos/resilience.test.ts

# CHAOS-007 — requires Toxiproxy + Docker Postgres
toxiproxy-server &
toxiproxy-cli create -l 0.0.0.0:25432 -u localhost:5433 postgres_chaos
pnpm vitest run tests/chaos/toxiproxy.test.ts

# CHAOS-008 — run each scenario on staging (see exact commands above)
# CHAOS-009 — see tests/performance/k6-setup.md
```

---

## Ownership

| Phase | Owner | Cadence | Environment |
|---|---|---|---|
| CHAOS-001–006 | QA / CI | Every push | Local/CI |
| CHAOS-007 | Platform / QA | Pre-release | Local Docker |
| CHAOS-008 | QA | Pre-release | Staging |
| CHAOS-009 (k6) | QA | Sprint end | Staging |
