# AVANIIS HR — Factual Corrections & Evidence Addendum
## Response to the Independent Enterprise Review of 13 June 2026 (79/100, "Approved with Conditions")

**Prepared:** 13 June 2026
**Scope:** Core HR only (Payroll out of scope per the review mandate).
**Environment caveat:** The Vercel deployment is **Development / UAT**, not Azure production; UAT accommodations (demo accounts, MFA bypass, disposable data) are accepted configurations, not defects.
**Purpose:** This memo does **not** dispute the review's overall posture ("Approved with Conditions"). It corrects a small number of findings that were scored on **incomplete evidence**, supplies the source artifacts that were missing from the extraction bundles, and **explicitly accepts** the findings that are genuinely valid — so the score can be re-derived against the platform's true state.

> **Methodology note (important for credibility).** Every statement below was verified against the live repository at the reviewed commit and confirmed with `git` history. Where the review is correct, we say so plainly. Where remediation post-dates the review's evidence, we cite the commit. This memo was written to be *self-correcting*: two findings we initially believed were review errors turned out to be valid once checked against the project's own 2026-06-12 revalidation — they are conceded below.

---

## 1. Executive Summary

The review is **directionally sound** and its "Approved with Conditions" recommendation is appropriate. However, the 79/100 reflects an **evidence package (the 7 extraction bundles) that did not contain several of the files the findings depend on.** Specifically:

1. **The bundles included `lib/effective-date.ts` and `lib/as-of-query.ts` but not** `lib/permissions.ts`, `lib/workflow-engine.ts`, `lib/workflow-guards.ts`, `lib/identity-uniqueness.ts`, `modules/communication/providers/*`, or migration `0065`. Findings about RBAC enforcement, segregation-of-duties, PII uniqueness, and email delivery were therefore scored without the implementing code in view.

2. **Several controls were committed on 2026-06-13** (commit `c0667cc` "Foundation Stewardship P2-T3, P1-H4, P3-D2", activated through `61eb76b`) — i.e. *after* the 2026-06-12 revalidation the review relied upon. The review and that revalidation describe a slightly earlier state of the codebase.

3. **One finding is factually incorrect** (email delivery), and **two were misattributed** (QA "false closure"; test count) — corrected in §2.

4. **The remaining conditions are real and we accept them** (§4): DataOps PII-write governance (P3-D3), completion of the permission-matrix rollout (P3-D2), rate limiting, CD pipeline, coverage refresh, IBAN-at-rest decision, and the documentation set.

Net effect: the corrections remove unjustified deductions in **Security, Governance, and Functional Completeness**, while the accepted conditions keep the "Approved with Conditions" posture honest. A re-derived band is proposed in §5 — **for the reviewer to validate, not asserted.**

---

## 2. Factual Corrections (review statement → code truth → evidence)

### 2.1 Email delivery — "not connected / SMTP not wired" → **Implemented**

**Review states:** "Email delivery is not connected — schema/tables exist but SMTP not wired" (Deliverable 9 row 22; Risk RISK-ARCH-02).

**Code truth:** Both transports are fully implemented with working send paths; queuing and a 5-minute dispatcher cron are live. The transport source (`modules/communication/providers/`) and the email service were **not included in any extraction bundle** — only the design doc (`docs/EMAIL-COMMUNICATION-PLATFORM.md`, bundle P5 §A-06) was. The review reasonably inferred "not wired" from a doc-only view.

- SMTP transport (nodemailer) — real network send:
  ```
  // modules/communication/providers/smtp.ts:41
  async send(email: OutboundEmail): Promise<ProviderSendResult> {
    const info = await this.transporter().sendMail({ from, to, subject, html, text, replyTo })
    return { success: true, providerMessageId: info.messageId }
  }
  ```
- Microsoft Graph transport — OAuth2 + `/sendMail` (`modules/communication/providers/graph.ts:66-96`).
- Queue → dispatch pipeline: `modules/communication/email-service.ts:122-226` (`dispatchQueued`), enqueue via `modules/communication/orchestrator.ts`, driven by `app/api/cron/email-dispatch/route.ts:22-36` (`dispatchBatch(50)`, every 5 min per `vercel.json`, `CRON_SECRET`-gated).

**Precise statement:** Email delivery is **code-complete for both Graph and SMTP**. What remains is an **environment/admin action** — entering provider credentials and activating one provider via `/settings/communication`. "Not connected" describes a *configuration state in UAT*, not missing implementation.
**Affects:** Architecture Readiness, Functional Completeness, Risk RISK-ARCH-02 (should be reclassified from "not connected" to "provider activation pending in UAT").

### 2.2 "16,333+ tests / 1,215 unit + 245 cross-browser + 91 E2E + 57 chaos" → **methodology mismatch**

**Code truth:** The verifiable test structure is **189 test files / ~3,386 `it`/`test` cases** (2,016 unit · 706 integration · 209 security · 283 E2E · 94 lib · 34 performance · 27 chaos · 17 accessibility). There is no separate "cross-browser" suite (Playwright drives the E2E projects). The "16,333" figure originates from an **internal report** (`tests/TEST_RESULTS_REPORT_05May26.md:31-32`, dated 05 May) using a different (assertion-level) counting basis, which the review carried forward verbatim.
**Affects:** Nothing materially — but the platform's test evidence should be cited as **189 files / ~3,386 cases**, which is itself strong. This correction *reduces* an inflated figure, in the interest of accuracy.

### 2.3 "QA Master Report *falsely closed* P3-D2 / P3-D3" → **misattributed (and a governance positive)**

**Code truth:** The Master Report (`docs/qa-qc/00-MASTER-QA-QC-REPORT.md`) lists P3-D2 and P3-D3 as **OPEN** in §7.1 (lines 104-105) and §10 (line 180) — it never closed them. The "falsely listed as closed" wording comes from the project's **own independent revalidation** (`docs/qa-qc/revalidation-2026-06-12.md:11`), which found they had been over-claimed in a *separate interim W1 wave summary* and corrected the record.
**Interpretation:** This is evidence of **functioning QA governance** — the team's own independent revalidation caught and corrected an over-claim before any external review. The defects themselves are genuinely open (see §4). The review's underlying concern (P3-D2/D3 open) is valid; the "Master Report falsely closed them" framing is not.
**Affects:** Governance and Documentation readiness should reflect a QA process that **self-corrects**, not one that ships false closures.

---

## 3. Remediation Not Visible to the Review (committed 2026-06-13, supplied here for re-scoring)

These controls existed in the repository at the reviewed commit but their implementing files were **absent from the extraction bundles**, so they could not be scored. They are supplied here with citations.

### 3.1 P2-T3 — Segregation of duties / self-approval guard → **IMPLEMENTED**
The 2026-06-12 revalidation listed this OPEN ("no self-approval guard, `lib/workflow-engine.ts:1181-1187`"). It is now enforced:
```
// lib/workflow-engine.ts:1206  (import: lib/workflow-guards.ts → evaluateSelfApprovalGuard)
// P2-T3 (BR-WF-SOD-001): block self-approval, self-rejection-from-queue,
// and delegation to the initiator/self. Only the SYSTEM actor is exempt.
const sodVerdict = evaluateSelfApprovalGuard({ decision, actorPersonId, initiatedByPersonId, delegateToPersonId, isSystemAction })
if (sodVerdict.blocked) { /* audit WORKFLOW.SELF_APPROVAL_BLOCKED; return error */ }
```
**Status:** Closed in code (commit `c0667cc`). Recommend re-verification under Governance.

### 3.2 P1-H4 — Identity uniqueness (Emirates ID / passport / employee code) → **ENFORCED (DEV/UAT)**
Revalidation listed this OPEN ("no uniqueness on emirates_id/passport/employee_code"). Now addressed via migration `0065_identity_uniqueness.sql` (employee_code unique index live; Emirates-ID/passport enforced via deterministic HMAC-SHA256 hash columns + partial unique indexes) plus `lib/identity-uniqueness.ts` in-transaction pre-checks.
**Status:** Applied + backfilled to **DEV/UAT** per the migration ledger and activation commits (`99add75`, `61eb76b` "P1-H4 fully activated — enforcement on"). *Isolated Azure-Production apply remains pending* (tracked in `docs/environment/migration-ledger.production.md`). The migration file's "NOT APPLIED" header is the authoring-time default; the ledger is the apply-status SSOT.

### 3.3 P3-D2 — Runtime permission resolver → **EXISTS, ROLLOUT PARTIAL**
Revalidation stated "no runtime `requirePermission()` resolver exists; enforcement is client-side only." A runtime resolver now exists (`lib/permissions.ts`, commit `c0667cc`):
```
// lib/permissions.ts — requirePermission() throws 'FORBIDDEN:' on DENY; second gate after requireRole()
if (verdict === 'DENY') throw new Error(`FORBIDDEN: role ${actor.role} lacks '${action}' permission on '${featureKey}'`)
```
**However**, it is wired to only **3 server actions** today (`modules/core-hr/actions.ts:70`, `:654`; `modules/reports/employee-history.ts:143`), and unmatrixed features fall through to `LEGACY_ALLOW`. **The review's "not fully wired" is therefore accurate** — what changed is that the resolver foundation now exists; the open work is rolling it out across all server actions. Carried forward as a condition (§4).

---

## 4. Findings We Confirm and Accept (the review is correct)

These remain genuine pre-Azure-production conditions. We do not dispute them.

| # | Finding | Status / evidence | Disposition |
|---|---|---|---|
| C1 | **P3-D3 — DataOps PII-write bypass + hard DELETE** | Route (`app/api/dataops/.../[id]/route.ts`, dated 2026-05-22) is SUPER_ADMIN-gated and snapshot-gated with a dedicated `dataops.audit_log`, **but** raw writes bypass the ORM encryption layer, effective-dating, and the *main* audit pipeline, and a hard DELETE of the original row is possible. Confirmed open by `revalidation-2026-06-12.md:11`. | **Accept.** Route PII-table writes through encryption/effective-date or block; mirror to main audit; prevent hard DELETE of HR rows. |
| C2 | **P3-D2 — full permission-matrix rollout** | Resolver exists (§3.3) but wired to 3 actions. | **Accept.** Complete wiring across server actions. |
| C3 | **No application-level rate limiting** | Absent; feature marked `SOON` in admin UI. Confirmed. | **Accept.** Required pre-Azure (login, search, API). |
| C4 | **No CD pipeline** | Only `ci.yml` + `soak-test.yml`; no deploy workflow. Confirmed. | **Accept.** Add Azure DevOps CD with gates. |
| C5 | **Coverage 59.12%** | Confirmed — **and dated 2026-04-30** (`coverage/index.html`), pre-dating recent work. | **Accept + regenerate** before quoting; target ≥70%. |
| C6 | **IBAN at-rest = masked, not encrypted (P2-P2)** | `revalidation-2026-06-12.md:10` — masked on `payroll_results`; full IBAN from encrypted master. | **Accept.** Business decision: encrypt-at-rest vs formally accept masking. (Touches Payroll-adjacent table; Core HR `persons` PII is encrypted.) |
| C7 | **`tests/performance/staging-auth-cookie.txt` git-tracked** | Confirmed tracked; session cookie (expired, 30-min TTL). | **Accept.** `git rm --cached` + `.gitignore` + history purge. |
| C8 | **Migration journal gap (0040–0054 manual) + 0065 prod-apply pending** | Per `CLAUDE.md` and the migration ledgers. | **Accept.** Reconcile before Azure production cutover. |
| C9 | **Missing Data Dictionary / BPMN / production runbook / DR plan** | Schema exists in code; no standalone artifacts. | **Accept.** Author from `drizzle/schema/*.ts` + workflow docs. |
| C10 | **CI integration tests** | Included in `vitest` but no Postgres service in CI, so DB-dependent tests don't truly execute in CI. | **Accept (clarify):** "not skipped by config" but "not exercised in CI without a test DB." |

We also accept the review's **clarifications-as-context** (no change requested, noted for accuracy):
- Demo accounts / MFA bypass are **correctly gated** — `areDevAccountsAllowed()` hard-blocks on `DATABASE_ENV=production`; MFA step-up enforced for HIGH_PRIVILEGE_ROLES on Entra ID; LOCAL/UAT exemption is documented (OP-001). Accepted UAT configuration.
- DB connection pool `max:5` is **intentional** for the Neon pooled (pgBouncer) endpoint, not a capacity oversight (raise in Azure).
- `KNOWN_GAPS.md` is stale (2026-05-01) but **self-flags** and points to the Master Report + revalidation as the current source.

---

## 5. Score Impact (proposed, for the reviewer to validate — not asserted)

The corrections do not touch the *real* conditions; they remove deductions taken on missing or misread evidence. Suggested re-derivation:

| Dimension | Review | Basis for adjustment | Suggested |
|---|---|---|---|
| Security (UAT) | 78 | Email implemented (§2.1); demo/MFA gating correct; SoD guard (§3.1) & identity uniqueness (§3.2) now enforced. P3-D3, rate limiting, full P3-D2 still open. | 81–84 |
| Governance | 76 | QA process self-corrects (§2.3, not a false-closure ship); SoD/uniqueness controls live. P3-D2 rollout + DataOps governance open. | 80–83 |
| Architecture | 76 | Email transport layer present and dispatching (§2.1). Other points (API gateway, events, journal) stand. | 78–80 |
| Functional Completeness | 84 | Email delivery functional, not absent. | 86–88 |
| Effective Dating | 88 | No change — concur. | 88 |
| Documentation | 80 | QA self-correction is a positive; doc-set gaps (C9) stand. | 80–82 |
| AI Readiness | 58 | No change — concur (advisory-only ARIA). | 58 |
| Code Quality / QA | 80 | Test figure corrected to 189 files / ~3,386 cases (still strong); coverage 59% (dated) stands. | 78–80 |

**Indicative overall band: ~82–85** (was 79), **contingent on the reviewer re-verifying the §3 artifacts** (`lib/permissions.ts`, `lib/workflow-engine.ts`/`lib/workflow-guards.ts`, migration `0065`/`lib/identity-uniqueness.ts`, `modules/communication/providers/*`). **Recommendation posture is unchanged: Approved with Conditions** — the conditions in §4 (C1–C10) are the authoritative remaining list, replacing the review's condition list where it overlaps.

---

## 6. What We Are NOT Claiming

- We are **not** claiming production readiness — Azure hardening (C3, C4, C7, C8) is real.
- We are **not** disputing P3-D3, the incomplete P3-D2 rollout, rate limiting, CD, coverage, IBAN-at-rest, or the documentation gaps.
- We are **not** asserting a final score — §5 is a transparent re-derivation for the reviewer to confirm.

---

## Appendix — Evidence Index (re-verifiable against the live repo @ `61eb76b`+)

| Claim | File:line | Commit |
|---|---|---|
| SMTP transport send | `modules/communication/providers/smtp.ts:41-54` | (existing) |
| Graph transport send | `modules/communication/providers/graph.ts:66-96` | (existing) |
| Email dispatch service | `modules/communication/email-service.ts:122-226` | (existing) |
| Email dispatch cron | `app/api/cron/email-dispatch/route.ts:22-36` | (existing) |
| Self-approval guard (P2-T3) | `lib/workflow-engine.ts:1206-1235`; `lib/workflow-guards.ts` | `c0667cc` |
| Permission resolver (P3-D2) | `lib/permissions.ts` (`requirePermission`, `evaluatePermission`) | `c0667cc` |
| requirePermission wiring (3 sites) | `modules/core-hr/actions.ts:70,654`; `modules/reports/employee-history.ts:143` | `c0667cc` |
| Identity uniqueness (P1-H4) | `drizzle/migrations/0065_identity_uniqueness.sql`; `lib/identity-uniqueness.ts`; `drizzle/schema/foundation.ts:189-191` | `c0667cc`/`99add75`/`61eb76b` |
| DataOps route (P3-D3 — open) | `app/api/dataops/tables/[schema]/[table]/[id]/route.ts:74-149` | 2026-05-22 |
| QA P3-D2/D3 listed OPEN | `docs/qa-qc/00-MASTER-QA-QC-REPORT.md:104-105,180` | (existing) |
| Revalidation (P3-D2/D3 open, W1 false-closure, P2-P2 masked) | `docs/qa-qc/revalidation-2026-06-12.md:10-11,16` | (existing) |
| Coverage 59.12% @ 2026-04-30 | `coverage/index.html` | (existing) |
| Test structure 189 files / ~3,386 cases | `tests/**`; report figure `tests/TEST_RESULTS_REPORT_05May26.md:31-32` | (existing) |
| Demo/MFA gating | `lib/auth.ts:361,582-611`; `lib/environment-guardrails.ts:44-48` | (existing) |

*Note: the live repository has advanced past the reviewed commit `61eb76b` (subsequent i18n commits). The bundles are a point-in-time snapshot; this memo's citations hold at `61eb76b` and later.*
