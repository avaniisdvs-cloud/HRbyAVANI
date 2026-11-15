# Monitoring & Error-Tracking Readiness

> **Status: PARTIALLY CLOSED / implementation-ready.** A vendor-neutral integration point exists in code (`lib/monitoring.ts`). **Full closure requires an external provider account + alert routing configured and tested** in the production/Azure environment — pending.

## 1. What exists now (this task)
- **`lib/monitoring.ts`** — additive, dependency-free central capture: `captureException`, `captureMessage`, `reportCronFailure`, `registerMonitoringProvider`. No-op fallback logs a **structured `[MONITOR]` line** (so platform logs can alert) and **never throws / never crashes** a request. Not yet wired into call sites (separate reviewed change).
- **`lib/production-preflight.ts`** — `validateProductionConfig()` flags missing `MONITORING_PROVIDER` (warning) and other prod-critical config.
- **Health endpoint:** `app/api/health` exists.
- **Crons:** `vercel.json` defines `workflow-sla`, `email-dispatch`, `future-dated-activation`; routes are `CRON_SECRET`-authenticated.

## 2. To activate a provider (production task — pending)
1. Choose provider: **Azure Application Insights** (recommended for Azure prod), Sentry, or Datadog.
2. Add the SDK dependency (only at activation) and create an adapter implementing `MonitoringProvider`.
3. Call `registerMonitoringProvider(adapter)` once at server bootstrap (e.g. `instrumentation.ts`).
4. Set `MONITORING_PROVIDER=<name>` + provider DSN/key via environment secrets (never commit).
5. Wire `captureException` into: error boundaries, server-action catch blocks, and cron `catch` paths via `reportCronFailure(jobName, err)`.

## 3. Cron failure visibility
- Each cron route should `catch` → `reportCronFailure(name, err)` and return non-200 so platform cron monitoring flags it. (Wiring pending — additive, low-risk.)
- Configure provider alerts: cron not-run, cron non-200, error-rate spike, health-check failure.

## 4. Production expectations (fail-loud)
- `validateProductionConfig()` returns a `MONITORING_PROVIDER` warning in production when unset; promote to a deploy-gate error once the provider is chosen.
- Until a provider is wired, the no-op fallback ensures errors still reach platform logs as structured `[MONITOR]` lines — **not silent**.

## 5. Closure criteria (for sign-off)
- [ ] Provider account + project created (Azure App Insights / Sentry / Datadog).
- [ ] Adapter registered at bootstrap; `MONITORING_PROVIDER` set in prod secrets.
- [ ] `captureException` wired into error/cron paths.
- [ ] Alert routing tested (trigger a synthetic error + a failed cron).
- [ ] Uptime/health check monitor configured.
