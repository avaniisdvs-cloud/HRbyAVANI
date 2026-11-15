# Production Go-Live Readiness Review — AVANIIS HR

> **VERDICT: NO-GO for production go-live (as of 2026-06-15, HEAD `b438b03`).**
> Independent senior production-readiness review. Evidence-based, source-verified.
>
> **Hard truths this document records:**
> - The current Vercel deployment (`avaniishcm.vercel.app`, fra1) is **DEV/UAT only** — it serves the single DEV/UAT Neon DB. The **isolated Azure production environment is not yet active**.
> - **Business UAT approval is NOT production approval.** Controlled non-payroll business UAT may proceed; it is necessary but not sufficient for go-live.
> - **Payroll is built, routed, role-gated, and functional** — NOT "dormant/unwired." It is **deferred** from the first release and must be feature-gated, not merely nav-hidden.
> - **UAT exceptions** (demo accounts, dev-login, MFA bypass, disposable fixtures, local `/tmp` storage, local-DB evidence, payroll exclusion-by-policy) are accepted **only for DEV/UAT** and must be closed/verified before production.
> - **Azure production go-live requires separate hardening, production-faithful evidence, and CAB approval.**
>
> No payroll was executed and no cloud DB write was performed in producing this review.

---

## A. Production Go-Live Blocker Register

| ID | Area | Finding | Severity | Production impact | Evidence | Required fix / sign-off | Owner | Status | Go-live impact |
|---|---|---|---|---|---|---|---|---|---|
| P-1 | Environment | Isolated Azure production environment not active; Vercel serves DEV/UAT Neon DB | **Critical** | No production runtime/DB exists | `docs/environment/environment-governance.md`; `vercel.json` (fra1) | Stand up isolated Azure prod (Test+Prod), separate secrets/Entra apps/enc keys | IT Owner | Open | Blocks Go-Live |
| P-2 | Database | **Reclassified (BLK-014 — see governance record).** 0063/0064/0065 = **verified DEV/UAT**, production apply **HUMAN-GATED_BY_BLK-013** (no prod DB yet — not standalone blockers). 0066 = **payroll-deferred, out of Core HR scope** (archive branch). 0067 = **STILL_REQUIRED_PENDING** (not applied to any env). Journal gap 0040+ is manual SQL. | **Critical** | Apply gated on prod DB (BLK-013); 0067 pending apply | `docs/production-readiness/migration-0063-0067-governance.md`; `pnpm migration:governance`; `migration-ledger.production.md`; `migration-ledger.test.md` | When prod DB exists (BLK-013): clone rehearsal, backup, ordered apply 0040+→0067, verify, rollback test; DBA + CAB. 0067 apply human-gated. | DBA/Data Owner + CAB | **Partially closed / human-gated** | Blocks Go-Live (gated by BLK-013 + 0067 apply) |
| P-3 | Storage | Durable blob storage (Azure/S3) not configured for prod; UAT on `/tmp`/local | **Critical** | Document uploads non-durable / unservable in prod | `lib/storage/factory.ts` (throws if prod + provider unset — **fails closed, good**); `lib/blob-storage.ts` | Configure `DOCUMENT_STORAGE_PROVIDER=azure` (or aws) + credentials in prod; verify upload/download round-trip | IT Owner | Open | Blocks Go-Live |
| P-4 | Payroll | ~~Payroll reachable by URL; only nav-hidden, no feature flag~~ **FIXED**: `PAYROLL_WORKSTREAM_ENABLED` gate now blocks payroll **layout + all 14 server actions + nav**, fails closed (disabled by default). RBAC unchanged. | **High** | Payroll is now blocked by URL and action for the Core HR release | `lib/features/payroll-feature-gate.ts`; `payroll/layout.tsx`; `modules/payroll/actions.ts` (12 gates) + `modules/payroll/payroll-assignment-actions.ts` (2 gates); `config/workspace-nav.ts` (`getVisibleWorkspaces`); tests `tests/security/payroll-gate.test.ts` | DONE for Core HR. Payroll **functional** readiness (full payroll UAT) remains deferred/payroll-only | Payroll Owner + Security | **Closed (Core HR)** | Payroll-only deferred; non-payroll unblocked |
| P-5 | Security/Config | Prod must enforce: `DATABASE_ENV=production` (or `VERCEL_ENV=production`), **no** `ENABLE_DEV_ACCOUNTS`, Entra configured for MFA | **High** | Demo accounts / dev-login / MFA bypass would activate if misconfigured | `lib/environment-guardrails.ts areDevAccountsAllowed()`; `lib/auth.ts:396` (Entra MFA) | Verify prod env vars; confirm demo accounts disabled + Entra MFA step-up live; least-privilege access model | Security + IT | Open | Blocks Go-Live |
| P-6 | Observability | **Partially fixed**: monitoring abstraction (`lib/monitoring.ts`) now **wired into all 5 cron failure paths** via `reportCronFailure`; falls back to structured logs; provider adapter is pluggable. Still no external provider/alert routing configured. | **High** | Cron failures now captured + structured-logged; external alerting still pending | `lib/monitoring.ts`; `app/api/cron/*/route.ts` (5 routes wired); `MONITORING-READINESS.md`; preflight warns when `MONITORING_PROVIDER` unset | Register a real provider (Sentry/Datadog/App Insights) + alert routing + uptime checks | IT Owner | **Partially closed** | Blocks Go-Live (until provider+alerts live) |
| P-7 | Support | No production runbook / incident-response / rollback playbook (only `deployment-aws.md`, `deployment-azure.md`) | **High** | No operational playbook for incidents | `docs/` (no runbook/incident doc) | Author production runbook, incident response, escalation, rollback procedure | IT Owner | Open | Blocks Go-Live |
| P-8 | Performance | **Partially fixed**: executable algorithmic smoke added (`pnpm perf:core-hr:smoke`, synthetic, CI-safe, thresholds + fail exit). Production-like DB-backed load test still pending. | **Medium** | Algorithmic regressions now gated in CI; scale behaviour on real data still unproven | `scripts/core-hr-performance-smoke.mjs`; `docs/environment/CORE-HR-PERFORMANCE-READINESS.md`; existing `tests/performance/` k6 harness | Run k6 against production-faithful headcount + concurrency; add pagination where any full-set query exceeds target | IT Owner | **Partially closed** | Blocks Go-Live (Medium) |
| P-9 | Email | **Prepared**: delivery is fail-closed (`EMAIL_DELIVERY_MODE`, live requires `DATABASE_ENV=production`); preflight now enforces email config in prod; doc added. 0062 + provider/sender/domain still pending. | **Medium** | No live email until 0062 applied + provider/domain configured | `modules/communication/delivery-policy.ts`; `lib/production-preflight.ts` (email checks); `docs/environment/EMAIL-PRODUCTION-READINESS.md`; ledger 0062 pending | Apply 0062 to prod; configure Graph/ACS/SMTP sender + domain (SPF/DKIM); set `EMAIL_DELIVERY_MODE=live`; verify dispatch+retry+audit | IT + HR | **Prepared / awaiting prod** | Blocks Go-Live (Medium) |
| P-10 | Effective-dating | Core HR engine production-capable; 0063/0064 Test/UAT-verified, pending prod; open PO items (Q20.2/2.3/2.5) are payroll-retro/proration/EOSB + absence-balance ledger | **Medium** | Core HR OK with 0063/0064 applied; deferred items are payroll/leave-specific | `migration-ledger.production.md`; `docs/project-memory/2026-06-04/19-EFFECTIVE-DATING-AUDIT.md` (72/100) | Apply 0063/0064 in prod window; PO sign-off that retro/proration/EOSB/absence-ledger are out of first release | HR Owner + DBA | Open | Blocks Payroll Only (Core HR advisory) |
| P-11 | Build/Deploy | `next.config` has no `output:'standalone'` (needed for Azure container deploy) | **Low** | Azure container image build path not configured | `next.config.*` | Add `output:'standalone'` + bind `0.0.0.0:$PORT` if Azure container deploy chosen | IT Owner | Open | Blocks Go-Live (Low) |
| P-12 | Governance | Required production approvals not obtained; business UAT sign-off ≠ production approval | **Critical** | No authority to go live | `environment-governance.md` (Foundation/Activation Board) | Obtain Business, HR, Payroll(if incl), IT, Security, DBA, CAB sign-offs | All owners + CAB | Open | Blocks Go-Live |

**Accepted DEV/UAT exceptions (must be closed/verified before prod, NOT production controls):** demo accounts, dev-login alias flow, MFA bypass for dev creds, disposable test fixtures, local `/tmp` storage, local-DB evidence, O-9 local schema/seed gaps. *(Payroll is no longer "exclusion-by-policy" — it is now enforced by the `PAYROLL_WORKSTREAM_ENABLED` feature gate; see P-4.)*

---

## A.1 Closure pack — Core HR readiness wiring (2026-06-16, branch `hardening/corehr-score-90-plus`)

Fixable-now blockers were implemented in-repo for a Core HR-only release. **No payroll
executed, no cloud DB write, no production migration applied, RBAC not weakened,
production go-live NOT approved.**

| Workstream | What was done | Evidence | Result |
|---|---|---|---|
| Payroll feature gate (P-4) | `lib/features/payroll-feature-gate.ts` (`isPayrollWorkstreamEnabled`/`assertPayrollWorkstreamEnabled`/`PAYROLL_DISABLED_MESSAGE`, fails closed). Gated payroll **layout** (URL block + safe notice), **all 14 payroll server actions** (12 run-lifecycle: create/calculate/lock/submit/approve/reject/WPS/EOSB/confirm/definition/salary-element/WPS-record + 2 assignment mutations: assignToPayroll/correctPayrollAssignment), and **nav** (`getVisibleWorkspaces` hides Payroll workspace across rail/secondary/command-palette/mobile). RBAC checks unchanged and still run. Verified no payroll API routes, no payroll crons, no cross-module payroll execution entry points. | `tests/security/payroll-gate.test.ts`, `tests/unit/payroll-feature-gate.test.ts` | **Closed (Core HR)** |
| Production preflight (P-5 support) | Executable `pnpm prod:preflight` (`scripts/production-preflight.ts` → `validateProductionConfig`). Non-prod = advisory (exit 0); production = **fail-closed** (exit 1) on unsafe combos (dev accounts, non-durable storage, missing CRON_SECRET/Entra, localhost URL, email/payroll-flag mismatch). | `tests/unit/production-preflight.test.ts` (10 pass); proven exit 1 on unsafe env, exit 0 on safe env | **Closed (enforceable)** |
| Monitoring wiring (P-6) | `reportCronFailure` wired into all 5 cron failure paths; no-op structured-log fallback when no provider; pluggable adapter. | `app/api/cron/*/route.ts` (5 routes) | **Partially closed** (provider+alerts pending) |
| Performance checks (P-8) | Executable `pnpm perf:core-hr:smoke` (synthetic, CI-safe, per-check thresholds, fail exit). | `scripts/core-hr-performance-smoke.mjs`; `CORE-HR-PERFORMANCE-READINESS.md` | **Partially closed** (prod-like load test pending) |
| Email readiness (P-9) | Email production-delivery checks in preflight; readiness doc. Live delivery already fail-closed (requires `DATABASE_ENV=production`). No real email sent. | `lib/production-preflight.ts`; `EMAIL-PRODUCTION-READINESS.md` | **Prepared** (0062 + provider/domain pending) |

---

## B. Production Readiness Verdict

# 🔴 NO-GO

Production go-live is **not approved**. Multiple Critical blockers are open (P-1 isolated prod env, P-2 prod migrations, P-3 durable storage, P-5 prod security config, P-12 governance sign-offs). Business UAT success does not change this.

---

## C. First Production Release Recommendation

**Non-payroll HR only.** Payroll is deferred and must be feature-gated (P-4) at route + server-action level (not just nav) before any production release that authorized HR-tier users can reach. Include payroll only after a full payroll UAT cycle (see D-4) and Payroll Owner sign-off.

---

## D. Minimum Closure Plan (shortest safe path UAT → production)

**1. Must CLOSE before production (Critical/High):**
- P-1 stand up isolated Azure prod (Prod + Test, isolated secrets/keys/Entra).
- P-2 production migration rehearsal on a clone → backup → ordered apply 0040+→0067 → verify → rollback-tested; DBA + CAB.
- P-3 configure + verify durable storage (Azure Blob/S3) in prod.
- P-5 verify prod security config (DATABASE_ENV=production, no ENABLE_DEV_ACCOUNTS, Entra MFA live, demo accounts disabled).
- P-6 error tracking + alerting + cron/uptime monitoring.
- P-7 production runbook + incident response + rollback playbook.
- P-4 payroll feature-gate (route + action) **or** P-12 formal acceptance of reachable-by-authorized-role risk.

**2. Must FORMALLY ACCEPT before production (sign-off):**
- P-10 PO sign-off that effective-dating deferred items (retro payroll, mid-period proration, as-of EOSB, absence-balance ledger) are out of first release.
- P-12 Business / HR / IT / Security / DBA / CAB approvals; business UAT sign-off recorded as necessary-not-sufficient.
- O-9 accepted as local-fixture (not a prod issue) — prod uses the full faithful schema.

**3. Can DEFER after production (Medium/Low):**
- P-8 production-scale load test (do before high-volume go-live; can phase).
- P-11 `output:'standalone'` (only if Azure container deploy path chosen).
- P-9 email beyond core notifications (configure incrementally).

**4. PAYROLL-ONLY blockers (do not affect non-payroll go-live):**
- P-4 payroll feature-gate / authorization.
- Full payroll UAT cycle: create run → calculate → review → lock → approve → WPS → EOSB → GPSSA → DEWS → ILOE → accounting/export → audit → rollback → compliance sign-off.
- Effective-dating retro/proration/EOSB items (Q20.2/2.3/2.5).
- 0066 payroll gross-draft already verified DEV/UAT; prod apply pending its own gate.

---

## E. Required Documentation Statements (recorded here, authoritative)

1. **The current Vercel deployment is DEV/UAT only** and serves the DEV/UAT Neon DB; the isolated Azure production environment is not yet active.
2. **Business UAT approval is not production approval.** Non-payroll business UAT may proceed; production requires this register closed + CAB sign-off.
3. **Payroll is built and functional but deferred** unless explicitly authorized; it must be feature-gated (route + action), not merely nav-hidden, for a non-payroll release.
4. **All UAT exceptions must be closed/verified before production** (demo accounts, dev-login, MFA bypass, fixtures, `/tmp` storage, local-DB evidence).
5. **Azure production go-live requires separate hardening, production-faithful evidence, and CAB approval** — independent of any Vercel DEV/UAT result.

---

## F. Go / No-Go Checklist (production)
- [ ] Isolated Azure prod environment live (P-1)
- [ ] Prod migrations applied + verified + rollback-tested (P-2)
- [ ] Durable storage configured + verified (P-3)
- [x] Payroll feature-gated at route + action + nav (P-4) — `PAYROLL_WORKSTREAM_ENABLED`, fails closed
- [ ] Prod security config verified; demo accounts off; MFA live (P-5)
- [ ] Error tracking + alerting + cron/uptime monitoring (P-6)
- [ ] Production runbook + incident response + rollback (P-7)
- [ ] Production-scale load test (P-8)
- [ ] Email sender/domain + 0062 applied (P-9)
- [ ] Effective-dating deferred items signed off (P-10)
- [ ] `output:'standalone'` if Azure container (P-11)
- [ ] All approvals: Business / HR / Payroll(if incl) / IT / Security / DBA / CAB (P-12)

> **DEV/UAT evidence only — production go-live is NOT approved by this review.**
