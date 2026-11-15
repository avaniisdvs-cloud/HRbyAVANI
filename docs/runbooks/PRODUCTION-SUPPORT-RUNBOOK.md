# Production Support Runbook — AVANIIS HR

> **Status: CLOSED in repo/docs.** Company-specific names, phone numbers, and channels are **placeholders** to be filled by the IT/HR owners. Procedures are complete.
> Applies ONLY to the future isolated Azure production environment. The current Vercel deployment is DEV/UAT.

## 1. Release Go/No-Go checklist
Use `docs/environment/PRODUCTION-GO-LIVE-READINESS.md` §F. Release proceeds only when all Critical/High blockers are Closed/Accepted and all approvals (Business, HR, Payroll-if-included, IT, Security, DBA, CAB) are recorded. **Business UAT sign-off is necessary but not sufficient.**

## 2. Incident severity levels
| Sev | Definition | Target response | Examples |
|---|---|---|---|
| **SEV-1** | Prod down / data loss / security breach / PII exposure | Immediate (≤15 min) | Login down, DB unreachable, unauthorized data access |
| **SEV-2** | Major function broken, no workaround | ≤1 h | Approvals broken, documents not saving |
| **SEV-3** | Degraded / workaround exists | ≤1 business day | Slow dashboard, one report failing |
| **SEV-4** | Minor / cosmetic | Next release | Label/typo, minor UI |

## 3. Support ownership & escalation matrix (placeholders)
| Role | Owner | Contact | Backup |
|---|---|---|---|
| On-call engineer | _<name>_ | _<channel/phone>_ | _<name>_ |
| IT Owner | _<name>_ | _<…>_ | _<…>_ |
| DBA / Data Owner | _<name>_ | _<…>_ | _<…>_ |
| Security | _<name>_ | _<…>_ | _<…>_ |
| HR Owner | _<name>_ | _<…>_ | _<…>_ |
| Payroll Owner | _<name>_ | _<…>_ | _<…>_ |
| CAB / Change Manager | _<name>_ | _<…>_ | _<…>_ |
Escalation: On-call → IT Owner → (domain owner: DBA/Security/HR/Payroll) → CAB → Business Owner. SEV-1 pages all owners.

## 4. Rollback process (application)
1. Identify last-known-good deployment (Vercel/Azure release id).
2. Re-deploy/redirect traffic to last-known-good.
3. If a DB migration is implicated, follow §6 (DB) — app rollback alone may be insufficient.
4. Confirm health endpoint + smoke critical routes. Record incident timeline.

## 5. Database restore process
1. Declare SEV; freeze writes if data integrity at risk.
2. Identify restore target: latest backup or PITR timestamp (see migration runbook §2).
3. Restore to a new instance; verify row counts + integrity vs expectations.
4. Cut over (update `DATABASE_URL` secret); re-run app smoke.
5. DBA + Data Owner sign-off; post-incident review (§12).

## 6. Failed migration process
1. STOP at first failing migration (verification query fails). Do not continue the window.
2. If additive-only and not yet relied upon: drop added objects (file rollback posture).
3. If data was mutated: **restore from backup/PITR** (§5). Do not hand-reverse.
4. Mark ledger `rolled_back`; record cause; re-rehearse on clone before retry.

## 7. Failed deployment process
1. Build/deploy failure → traffic stays on previous release (no cutover).
2. Capture build logs; fix forward or stay on last-known-good.
3. Never disable RBAC/guards to "get it deployed."

## 8. Failed cron / email process
- Cron (workflow-sla, email-dispatch, future-dated-activation): check provider cron logs + `[MONITOR]` lines. Re-trigger manually with `Authorization: Bearer $CRON_SECRET`. Idempotency: re-running is safe by design; verify no duplicate side-effects.
- Email: check delivery policy (`DATABASE_ENV=production` required for live send), sender config, provider (Graph/ACS/SMTP), retry/audit trail. Failed sends are logged; re-dispatch after fix.

## 9. Security incident process
1. SEV-1. Engage Security owner immediately; preserve audit_log (INSERT-only) + access logs.
2. Contain (revoke sessions/keys; rotate `AUTH_SECRET`/secrets as needed).
3. Assess scope (PII? which tenant/entity?). Legal/PDPL notification path if PII exposed.
4. Eradicate + recover; mandatory post-incident review.

## 10. Business communication process
- SEV-1/2: IT Owner notifies Business + HR owners within the SLA with impact + ETA; updates on a fixed cadence until resolved; closure note after.
- Templated statuses: Detected / Investigating / Mitigated / Resolved.

## 11. Backup & retention
- DB: automated backups + PITR (per Azure/Neon plan); restore-tested per migration window.
- Audit: `audit_log` (and `workflow_audit_log` once 0067 applied) are INSERT-only; retention per compliance policy (placeholder: _<N>_ years).

## 12. Post-incident review template
- Summary · Timeline (detect→mitigate→resolve) · Severity · Root cause · Impact (users/tenants/data) · What went well · What didn't · Action items (owner + due) · Prevention (monitoring/alert/test added).
