# Runbook — Future-Dated Assignment Activation Cron

**Owner:** HR Platform Ops · **Created:** 2026-06-12 · **Job:** `/api/cron/future-dated-activation`

## What it does
Nightly job that finds approved future-dated worker assignment rows whose effective date has arrived (`isCurrent=false`, `effective_start_date <= today <= effective_end_date`, status ≠ INACTIVE) and activates them: recomputes the one-current pointer, syncs the materialised persons-row snapshot and position occupancy, validates invariants, and writes one audit event per activated person.

- **Engine:** `lib/jobs/future-dated-activation.ts` (`runFutureDatedActivation`)
- **Endpoint:** `app/api/cron/future-dated-activation/route.ts` (GET or POST)
- **Schedule:** `vercel.json` → `5 20 * * *` UTC (00:05 UAE time, start of new calendar day)
- **Auth:** `Authorization: Bearer ${CRON_SECRET}` — 401 otherwise

## Safety properties
- **Idempotent:** re-running on the same day is a no-op (`skippedReason: 'already-current-or-no-due-row'`).
- **Error firewall:** each person is processed in its own try/catch; one failure never aborts the batch; partial results returned with per-person errors.
- **Scope:** worker assignments only. Salary elements / schedules / payroll assignments are NOT activated by this job.

## Manual trigger (UAT / catch-up after outage)
```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  https://<deployment-host>/api/cron/future-dated-activation
```
Response JSON includes `activated`, per-person results, and any errors.

## Monitoring & troubleshooting
| Symptom | Check | Action |
|---|---|---|
| 401 from endpoint | `CRON_SECRET` set in environment and matches caller | Fix env var, redeploy |
| Future change past its date but still pending | Vercel cron execution log; Hobby-plan cron limits | Manual trigger (above); job is idempotent |
| Per-person error in response | Audit log + response `errors[]`; usually constraint violation (overlap/one-current) | Inspect that person's timeline on the Employee History report; correct via Retro Split / Correction mode |
| Duplicate activation suspicion | One-current partial UNIQUE (`uq_worker_assignments_one_current`) makes double-activation impossible at DB level | None — verify constraint exists in target DB (migration 0063/0064 applied) |

## Dependencies
Migrations `0063_effective_dating_integrity.sql` and `0064_worker_assignment_active_timeline.sql` MUST be applied to the target database before enabling this cron (apply status: `docs/environment/migration-ledger.*.md`).

## Tests
`tests/unit/future-dated-activation.test.ts` (6) · `tests/unit/future-dated-activation-behavior.test.ts` (2) · `tests/unit/effective-dating-error-firewall.test.ts` (2).
