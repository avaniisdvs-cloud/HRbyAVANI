# QA/QC Findings — Reality Check & Dependency-Safe Fix Plan

**Date:** 2026-06-02  
**Method:** 9 parallel skeptical read-only verifiers (each instructed to *disprove* findings against actual source/schema) + 1 fix-wave synthesis pass. Workflow run `wf_7da152c6-565`, 10 agents, 203 tool calls.  
**Constraint:** READ-ONLY. No code, schema, migration, commit, env, or deployment changes were made. This report is the only file written.  
**Source audit:** the 3-phase whole-app gap analysis performed earlier the same day.

> Each finding was re-verified from the live codebase. The prior audit was **not** assumed correct. Classifications below reflect what the code actually does, with file:line evidence.

## Executive Summary

- **Total findings verified:** 115
- **CONFIRMED_REAL:** 79
- **PARTIALLY_REAL:** 15
- **ALREADY_FIXED:** 15 (incl. prior-fix verifications that still hold)
- **FALSE_POSITIVE:** 4
- **NEEDS_BUSINESS_DECISION:** 2
- **DUPLICATE:** 0
- **NEEDS_RUNTIME_REPRO:** 0

**Real-defect severity (CONFIRMED + PARTIAL = 94):** 3 CRITICAL · 12 HIGH · 39 MEDIUM · 40 LOW

**Headline reversals (why the list is not as alarming as the raw audit suggested):**

- `P1-H3` (divergent person-update cross-entity hole) → **FALSE_POSITIVE**: the shipped edit form calls the *guarded* `updatePerson`; `updatePersonFromEdit` is unwired dead code.
- `P3-H5` (insurance does not end at notice period) → **FALSE_POSITIVE**: termination *does* extend+cancel enrolments to `terminationDate + noticePeriodDays` in `contracts/actions.ts`.
- `P2-L2` (leave counts calendar days) → **NEEDS_BUSINESS_DECISION**: the code explicitly implements `BR-AL-002 calendar-day arithmetic` by design — not a bug unless the rule itself is wrong.
- `P2-M-GCC-EOSB` (GCC nationals get expat EOSB) → **NEEDS_BUSINESS_DECISION**: depends on the client's GCC-pension policy interpretation.
- 15 prior fixes (COLLISION-001/003/006/PROBATION, ARIA-LOCK, BDP-008, RISK-PAYROLL-2, MFA SEC-04, document ownership/TTL/audit, DataOps DELETE gate, graceful ARIA failure, DOMPurify, etc.) were **re-verified and HOLD**.

**Why prior QA/Playwright/manual cycles passed despite real defects:** the confirmed issues are overwhelmingly *non-happy-path* — they need a forged Server-Action argument (client-supplied identity), two concurrent requests (balance/run-number races), a cross-entity actor, a transient DB error, or a code path with no UI entry point. Green-path E2E, typecheck, and build cannot surface any of these.

---

## Deliverable 1 — Reality-Check Report

### 1A. Rejected, Already-Fixed & Business-Decision findings

#### FALSE_POSITIVE (4)

These do not represent live exposure or defects.

**`P1-H3` — updatePersonFromEdit lacks cross-entity FORBIDDEN guard that updatePerson has**  
_Severity after:_ LOW  
_Why:_ PersonEditForm (the only edit UI) imports and calls updatePerson, NOT updatePersonFromEdit: app/(hr-admin)/persons/[id]/edit/PersonEditForm.tsx:17 imports `updatePerson` from '@/modules/core-hr', and line 433 `const result = await updatePerson(person.id, patch)`. There is no import or call of updatePersonFromEdit in PersonEditForm. `updatePerson` (modules/core-hr/actions.ts:665-667) DOES enforce the cross-entity guard inside its transaction: `if (user.role !== 'SUPER_ADMIN' && user.legalEntityId !== before.legalEntityId) throw new Error('FORBIDDEN...')`. It is true that updatePersonFromEdit (edit-person.ts) only does requireRole + Zod and has NO before-row legalEntityId comparison (its UPDATE at edit-person.ts:170 filters only by id+tenantId, allowing cross-entity write by a forged personId) — but updatePersonFromEdit appears to be dead/unwired (no caller in the persons UI). So the WHICH-path question resolves to: the live path (updatePerson) is already guarded. The vulnerable function exists but is not reachable from the shipped edit form.
  _Next:_ No live exposure. Confirm updatePersonFromEdit has zero callers (grep showed none in the persons UI) and either delete it as dead code or add the same before.legalEntityId === user.legalEntityId guard so a future wiring can't introduce the hole. Treat as cleanup, not a security incident.

**`P3-M-reports-scope` — FINANCE doc-expiry/contracts export has no department restriction; MANAGER scoping only on leave**  
_Severity after:_ LOW  
_Why:_ app/(hr-admin)/reports/export/route.ts:28-35 ROLE_ACCESS allows doc-expiry and contracts to SUPER_ADMIN/HR_DIRECTOR/HR_ADMIN/FINANCE — MANAGER is NOT in those lists, so a manager cannot reach them (403 at line 65). For doc-expiry (211-248) and contracts (251-289) the only scoping is scopeEntityId (legal-entity, line 67: non-SA uses their own entityId) plus an optional caller-supplied dept filter — there is intentionally no per-department lock for FINANCE/HR because those roles are entity-wide by design. MANAGER team-scoping (lineManagerId, lines 111-122,164-174) correctly applies only to leave-summary/leave-balances, the only two reports MANAGER can access. This matches the dual-layer RBAC design (FINANCE/HR = entity scope; MANAGER = team scope).
  _Next:_ No code change. If business later wants FINANCE limited to certain departments, that is a new requirement, not a defect.

**`P3-H5` — Insurance-ends-at-notice-period unwired — no termination path cancels/extends**  
_Severity after:_ NONE  
_Why:_ The termination path DOES handle insurance. modules/core-hr/contracts/actions.ts:336-370 (QF-2 / BR-INS-006): inside the termination transaction it selects all ACTIVE enrolments for the person (338-345), computes insuranceExpiryDate = addDays(terminationDate, noticePeriodDays) (347-348), and loops cancelEnrolmentTx for each (350-365) passing extensionDate=insuranceExpiryDate + extensionReason when noticeDays>0, in a try/catch so insurance failure does not block termination (366-369). The finding looked only at modules/core-hr/employment-actions/ (which has no termination action); termination lives in contracts/actions.ts. cancelEnrolmentTx is imported there (line 27).
  _Next:_ No action. (Note: the cancel loop is best-effort/swallowed-catch — if business requires hard guarantee that coverage extends through notice, consider surfacing failures, but that is a separate enhancement.)

**`P3-L-ESS-read-only` — MyInsuranceClient is read-only (no mutation handlers)**  
_Severity after:_ NONE  
_Why:_ app/(employee)/me/insurance/MyInsuranceClient.tsx — the only state is useState(showAllHistory) (line 80) for a show-more toggle; there are no server-action imports, no form submit, no mutation handlers. The footer explicitly says 'For changes to your insurance coverage, please contact HR Admin' (242-244). page.tsx only calls read queries (getPersonEnrolments + a select). ESS-read-only business rule is satisfied.
  _Next:_ No action.

#### NEEDS_BUSINESS_DECISION (2)

The code is internally consistent; whether it is *correct* depends on a business-rule confirmation.

**`P2-L2` — Leave duration counts raw calendar days (daysBetween+1); weekends/public holidays not excluded**  
_Severity after:_ MEDIUM  
_Why:_ computeRequestDurationDays (modules/absence/services.ts:120-133) returns `daysBetween(startDate, endDate) + 1` (or 0.5 for half-day) with comment 'BR-AL-002 — calendar-day arithmetic'; computeClosingBalance (services.ts:52-69) is also documented as 'BR-AL-002 (calendar-day arithmetic)'. createLeaveRequest (actions.ts:131-139) enforces durationDays MUST equal this calendar-day span. There is no join to or read of any publicHolidays table anywhere in the duration computation; grep confirms publicHolidays is not imported in services.ts or actions.ts. So the system is intentionally calendar-day, not working-day. Whether that is correct depends on the employment contract (many UAE annual-leave contracts ARE calendar-day inclusive of weekends/holidays per FDL 33/2021; others are working-day).
  _Next:_ Confirm with HR/business whether AVANIIS leave entitlements are calendar-day (current behavior, likely correct for UAE annual leave) or working-day. If working-day is required for any leave type, add a publicHolidays + weekend exclusion path keyed off the entity work_schedule; otherwise document BR-AL-002 as a confirmed calendar-day decision and close.

**`P2-M-GCC-EOSB` — GCC nationals get expat EOSB and no GPSSA — only UAE_NATIONAL is special-cased**  
_Severity after:_ MEDIUM  
_Why:_ modules/payroll/services.ts calculateGpssaContribution returns applies:false for any nationalityCategory !== 'UAE_NATIONAL' (line 51), and calculateEosb returns applies:false (GPSSA instead) ONLY for nationalityCategory === 'UAE_NATIONAL' (line 244). So GCC_NATIONAL falls into the expat EOSB branch (accrues gratuity, lines 259-313) AND gets no GPSSA. Under GCC unified pension rules, GCC nationals working in the UAE are generally enrolled in their home-country pension via GPSSA coordination rather than receiving expat EOSB — so this may be incorrect, but the correct treatment is a policy/legal determination, not derivable from code.
  _Next:_ Confirm with UAE/GCC payroll compliance whether GCC_NATIONAL should route to GPSSA (no EOSB) like UAE_NATIONAL. If yes, change both branches to test a set {UAE_NATIONAL, GCC_NATIONAL} (or a dedicated flag) and add fixtures.

#### ALREADY_FIXED / PRIOR-FIX VERIFIED (15)

Confirmed present and holding — no action required.

**`MFA-undefined-strict-equality` — mfaVerified === false strict equality leaves legacy/undefined JWTs unblocked; ENABLE_DEV_ACCOUNTS prod risk**  
_Severity after:_ LOW  
_Why:_ lib/auth.ts:526-533 requireRole uses `user.mfaVerified === false` (strict) so undefined (legacy JWTs minted before the field) is NOT blocked — this is intentional and documented at :30-35 ('undefined for legacy JWTs minted before this field was added (treated as trusted)') and :499. mfaVerified is set true for Entra ID at :301. The HIGH_PRIVILEGE_ROLES gate exists (:514, :526-533) and is the SEC-04 control. SEPARATE real risk: ENABLE_DEV_ACCOUNTS — auth.ts:100,205,527 — when set to 'true' in production it (a) enables the hardcoded DEV_ACCOUNTS demo/'demo' password logins (:100-136) AND (b) sets isDevSession=true (:527) which BYPASSES the MFA step-up gate entirely. That is a genuine prod-misconfiguration hole, not the strict-equality behaviour.
  _Next:_ Accept the mfaVerified===false strict-equality as designed (legacy-JWT compatibility, max 30-min window). Separately, add a hard guard so DEV_ACCOUNTS and the isDevSession MFA bypass can NEVER activate when NODE_ENV==='production' regardless of ENABLE_DEV_ACCOUNTS, or remove ENABLE_DEV_ACCOUNTS from production env entirely and assert its absence in a startup check.

**`RISK-PAYROLL-2` — Prior fix verification — advisory lock in nextRunNumber inside transaction**  
_Severity after:_ LOW  
_Why:_ actions.ts:75-94 nextRunNumber takes a tx, and acquires sql`SELECT pg_advisory_xact_lock(hashtext('payroll_run:' || legalEntityId))` (lines 81-82) BEFORE reading MAX(run_number) (lines 84-90). createPayrollRun calls it inside db.transaction (actions.ts:214-217). This correctly serialises concurrent same-entity createPayrollRun calls (the RISK-PAYROLL-2 scenario), confirmed by tests/integration/payroll-collision.test.ts. The fix is real and present for SAME-entity races. NOTE: it does NOT address the cross-entity collision in P2-P4 — the lock and MAX are per-entity while the DB unique is global on run_number, so two different entities can still collide on PR-000001.
  _Next:_ Keep the advisory lock. Close the residual cross-entity gap per P2-P4 (composite unique or globally-unique run numbers).

**`MdmDrawer focus-trap` — MdmDrawer WAI-ARIA focus trap (CB-BUG-002) still intact**  
_Severity after:_ NONE  
_Why:_ components/mdm/MdmDrawer.tsx:8 getFocusable() helper; :60-72 useEffect auto-focuses first focusable element on open and restores focus to the trigger on close (prevFocusRef); :78-92 useEffect Tab/Shift+Tab key handler wraps focus within the panel (Shift+Tab on first -> last). All three focus-management effects from the CB-BUG-002 fix are present and unchanged.
  _Next:_ No action required; focus trap remains correctly implemented.

**`P3-VERIFY-DOMPURIFY` — VERIFY: DOMPurify in pdf-template.tsx AND whether the jsPDF/react-pdf generation path applies equivalent sanitization**  
_Severity after:_ NONE  
_Why:_ Preview path: modules/employee-letters/pdf-template.tsx:10,24-25,92-93,127-129 — body sanitized via DOMPurify.sanitize before dangerouslySetInnerHTML (SEC-LETTER-001). Generation path is DIFFERENT but safe: generate-pdf.ts:5-9,61-68 uses @react-pdf/renderer with pdf-react-template.tsx, whose parseBody (pdf-react-template.tsx:12-22) strips ALL tags via .replace(/<[^>]+>/g,'') and renders only plain text inside react-pdf <Text> components — react-pdf renders to PDF primitives, not a browser DOM, so no script/innerHTML execution is possible. Therefore the actual generated PDF is not XSS-exploitable even though it does not call DOMPurify. The two paths use different but each-sufficient sanitization.
  _Next:_ No security action required. Optional consistency: document that the react-pdf path relies on tag-stripping (parseBody) rather than DOMPurify, and ensure parseBody is never replaced with an HTML-renderer without adding DOMPurify.

**`P3-VERIFY-GRACEFUL` — VERIFY: sendAriaMessage graceful failure (RateLimit/APIConnection/Auth → bilingual AriaResponse)**  
_Severity after:_ NONE  
_Why:_ modules/aria/actions.ts:120-149: RateLimitError → returns AriaResponse with bilingual retry message (never throws); APIConnectionError/AuthenticationError (line 139) → returns bilingual 'temporarily unavailable' AriaResponse; ARIA_NOT_CONFIGURED (line 152) → bilingual config message. All other errors fall to translateError (line 166) which logs server-side and returns GENERIC_ERROR with no SDK detail. The whole body is wrapped in try (line 41) with these handlers. Confirmed as designed.
  _Next:_ No action. Behaviour matches CHAOS-008 graceful-degradation design.

**`P3-VERIFY-LIFECYCLE` — VERIFY: letter SUBMITTED/FAILED lifecycle present**  
_Severity after:_ NONE  
_Why:_ requestLetter sets initialStatus = type.requiresApproval ? 'PENDING_APPROVAL' : 'SUBMITTED' (actions.ts:800); _autoGeneratePdf transitions SUBMITTED→APPROVED on success (line 914) or →FAILED with failureReason on error (line 943). app/(employee)/me/letters/page.tsx:14-24 STATUS_META includes SUBMITTED and FAILED entries. Lifecycle confirmed (English-only labels noted separately in P3-L-LETTER-BILINGUAL).
  _Next:_ No action (other than the separate bilingual gap).

**`P3-VERIFY-NOTIFREAD` — VERIFY: markNotificationRead recipient-scoped**  
_Severity after:_ NONE  
_Why:_ modules/notification/actions.ts:29-56: auth() required (line 29-30); row loaded first (lines 35-47); guard at lines 51-56 throws 'forbidden' unless session.user.role==='SUPER_ADMIN' OR row.recipientPersonId === session.user.personId. Update + audit run in a transaction (lines 62-89). Recipient-scoping confirmed.
  _Next:_ No action.

**`P3-VERIFY-PDFFAIL` — VERIFY: _autoGeneratePdf sets FAILED + failureReason + audit (no swallow)**  
_Severity after:_ NONE  
_Why:_ modules/employee-letters/actions.ts:853-967: on success sets status='APPROVED' + clears failureReason + LETTER.PDF_GENERATED audit (lines 908-933); on exception the catch (lines 936-966) updates status='FAILED', persists failureReason (errorMsg.slice(0,2000)) and writes LETTER.PDF_GENERATION_FAILED audit, then returns {success:false,error} — no silent swallow. requestLetter consumes pdfGenerated = genResult.success (actions.ts:838-841). Confirmed.
  _Next:_ No action.

**`PRIOR-FIX-dataops-delete-gate-crud-ident-mfa` — VERIFY: DataOps DELETE snapshot-confirmation gate; structured CRUD safeIdent + parameterization; MFA SEC-04 HIGH_PRIVILEGE_ROLES gate**  
_Severity after:_ NONE  
_Why:_ DELETE snapshot gate confirmed: [id]/route.ts:81-104 — SUPER_ADMIN required (:81), snapshot_id required else 400 (:90-92), snapshot must match schema/table/pk else 400 (:98-104), then archive-copy + delete + audit. CRUD safeIdent + parameterization confirmed: rows/route.ts:17-19 safeIdent double-quotes identifiers; POST values via $1..$n placeholders (:161,:166); [id]/route.ts:8-10 safeIdent, PATCH SET via $n placeholders (:44-53). MFA SEC-04 gate confirmed: lib/auth.ts:514 HIGH_PRIVILEGE_ROLES=[HR_ADMIN,HR_DIRECTOR,SUPER_ADMIN], requireRole():526-533 throws STEP_UP_REQUIRED when role requires MFA and mfaVerified===false (with isDevSession bypass).
  _Next:_ No action — these fixes are implemented as claimed. (Caveat: safeIdent prevents identifier injection but the DataOps schema/table params are not allowlisted against discovered tables in the rows POST/PATCH/DELETE paths beyond BLOCKED_SCHEMAS — low risk given SUPER_ADMIN-only, but worth allowlisting against getTableMeta.)

**`PRIOR-FIX-document-ownership-ttl-audit` — VERIFY: document ownership dual-check + 5-min signed URL TTL + URL_ISSUED/ACCESS_DENIED audit**  
_Severity after:_ NONE  
_Why:_ Dual ownership check confirmed: server action getDocumentUrl (modules/core-hr/documents/actions.ts:414-450 — EMPLOYEE self-only, hrOnlyVisibility block, cross-entity check, SUPER_ADMIN bypass) AND independently re-validated in app/api/documents/[id]/route.ts:196-211 (same checks). 5-min signed URL TTL confirmed: route.ts:320 `provider.getSignedUrl(row.storageKey, 5)` and getDocumentUrl audits ttlMinutes:5 (actions.ts:495). Audit confirmed: DOCUMENT.URL_ISSUED (actions.ts:491), DOCUMENT.ACCESS_DENIED on every deny branch (actions.ts:418,427,445,469; route.ts:198,202,208), DOCUMENT.ACCESSED on serve (route.ts:250,272,280,331). Cache-Control private no-store on streamed bytes (route.ts:260,290).
  _Next:_ No action — the ownership dual-check, short-lived signed URL, and audit trail are implemented as claimed.

**`PRIOR-FIXES` — Verification of claimed prior fixes (COLLISION-001/003/006/PROBATION, SLA dedup)**  
_Severity after:_ NONE  
_Why:_ COLLISION-001 atomic claim: lib/workflow-engine.ts takeWorkflowAction:1033-1055 `update(...).where(and(eq(id),eq(status,'PENDING'))).returning()` with empty-result race detection — HOLDS. COLLISION-003 submitWorkflow: doWrites closure dispatched in db.transaction (716-720) or outer tx — HOLDS; submitWorkflow accepts tx?:DbOrTx (81). COLLISION-006 post-claim: audit+step/instance writes+dispatchResourceCompletion all inside one db.transaction (1063-1168) with activateNextStep threaded tx (1120-1126) — HOLDS. dispatchResourceCompletion tx-threaded: param tx?:DbOrTx, client=tx??db (744-754), used for absence/hiring/transfer updates+notifications — HOLDS. COLLISION-PROBATION: applyProbationOutcome called with tx (820-829) — HOLDS. SLA remindedAt dedup: processSLABreaches query filters remindedAt null OR <24h ago (1290-1294) and SEND_REMINDER wraps queueNotification+remindedAt update+audit in one tx (1368-1399) — HOLDS. DELEGATE+audit tx (997-1024) and ESCALATE dual-write tx (1322-1343) also present.
  _Next:_ No action; prior fixes verified present and correct in current source.

**`VERIFY-ARIA-LOCK` — Prior fix: pg_advisory_xact_lock per-person before overlap check in createLeaveRequest**  
_Severity after:_ NONE  
_Why:_ createLeaveRequest (actions.ts:259-261) executes `SELECT pg_advisory_xact_lock(hashtext('leave:' || ${data.personId}))` as the first statement inside db.transaction (after SET LOCAL timeouts at 245-247), BEFORE the overlap SELECT (327-350) and balance gate (352-408). The lock is transaction-scoped (xact variant), per-person, auto-released on commit/rollback — exactly the documented Phase 3 P6D fix. This correctly serialises concurrent same-person creates against the overlap race.
  _Next:_ Hold the fix. When fixing P2-L1, keep the pending-reservation read/write inside this same advisory-locked transaction so the reservation is race-safe.

**`VERIFY-BDP-008` — Prior fix: no-policy = BLOCK and no caller-entity fallback (backdate)**  
_Severity after:_ NONE  
_Why:_ createLeaveRequest backdate pre-flight (actions.ts:155-231): the employee's legal entity is resolved from the DB by personId (162-167) with NO fallback to caller-supplied data.legalEntityId — if the person row is missing it throws PERSON_NOT_FOUND immediately (169-174). resolveBackdatePolicy is called with the DB-verified employeeEntityId (180). When the policy row is null the code throws BACKDATE_POLICY_MISSING (192-202) — i.e. no-policy = BLOCK (safe default). NOTE: the docstring on resolveBackdatePolicy (backdate-policy-actions.ts:67-68) is STALE — it still says 'null → no restriction applies (any past date allowed)', contradicting the actual enforcement; this is a comment-only defect, the consuming code is correct. backdatingEnabled=false → BACKDATE_NOT_ALLOWED (204-211); over-limit → BACKDATE_LIMIT_EXCEEDED (213-229). All match the BDP-008/BDP-009 hardening.
  _Next:_ Hold the fix. Minor: correct the stale docstring at modules/absence/backdate-policy-actions.ts:67-68 to read 'null = no policy = backdating BLOCKED by default' so future readers don't reintroduce the old behavior.

**`VERIFY-COLLISION-003` — Prior fix: single outer transaction in submitLeaveRequest (caller-level atomicity)**  
_Severity after:_ NONE  
_Why:_ submitLeaveRequest wraps submitWorkflow AND the absence_entries status update AND the audit AND the outbox event AND the manager notification in ONE outer db.transaction (actions.ts:583-701): submitWorkflow is called with `tx: outerTx` (610) so the engine joins the outer tx; a failed v2Result throws (612-614) rolling everything back; the status update (617-627), audit (629-641), outbox insert (645-653) and notification (681-697) all use outerTx. This matches the documented Phase 3 P6C COLLISION-003 caller-level fix; the comment at 573-582 confirms the two-transaction split was closed and emitCompensationEvent is no longer invoked from this path (it remains defined but unused here).
  _Next:_ Hold the fix. The unused emitCompensationEvent (actions.ts:714-?) could be flagged as dead code for this path but is still referenced by decideLeaveRequest; leave as-is.

**`VERIFY-getMyProfile-ownership` — Prior fix: getMyProfile EMPLOYEE ownership guard + updateMyProfile re-check**  
_Severity after:_ NONE  
_Why:_ modules/profile/actions.ts:24 — getMyProfile: `if (session.user.role === 'EMPLOYEE' && session.user.personId !== personId) return null` (admin roles may cross-read by design). modules/profile/actions.ts:634 — updateMyProfile: `if (session.user.personId !== personId) return { success:false, error:'Permission denied' }`, an even stricter all-roles ownership gate, documented at 631-633 as the sole authorisation gate for ESS writes. Both guards are present and run before any DB read/write. getDocumentDownloadUrl also enforces ownership at 939/943.
  _Next:_ No action. Optionally add a regression test if not already covered.

### 1B. Confirmed & Partially-Real defects (full detail)

Ordered by post-verification severity, then area. Every entry carries: classification, severity, evidence, why QA missed it, recommended action, schema-change?, data-migration?, cross-module?, and required test coverage.

#### — CRITICAL —

##### `P3-A1` · sendAriaMessage trusts client-supplied sessionCtx (personId/role/legalEntityId) — never re-derived from auth()

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** CRITICAL
- **Area:** ARIA, Notification outbox, Employee Letters
- **Evidence:** modules/aria/actions.ts:35-53 sendAriaMessage(message, sessionCtx: AriaSessionContext, ...) only calls auth() at line 42-43 to check session?.user EXISTS; it never re-derives identity. The client-supplied sessionCtx is passed verbatim to handleIntent(ctx) and submitConfirmedLeaveRequest(draft, ctx). submitConfirmedLeaveRequest (actions.ts:177-207) builds the leave with personId: ctx.personId and legalEntityId from ctx/draft. In services.ts:80-92 the role gate requireRole(ctx, ADMIN_ROLES) reads ctx.role — a forged ctx.role='HR_ADMIN' passes the COMPLIANCE/WORKFLOW gates (services.ts:949-962). sessionCtx originates server-side in app/(employee)/me/aria/page.tsx:58-65 and app/(hr-admin)/aria/page.tsx, but it is handed to the Client Component AriaChatClient (components/aria/AriaChatClient.tsx:282) which re-submits it as a Server Action argument — i.e. it crosses the client boundary and is fully attacker-controllable. AriaSessionContext (modules/aria/types.ts:44-47) is plain {personId,role,legalEntityId}. NOTE: the ARIA.QUERY audit row still records the REAL attacker via session.user.id/role (actions.ts:95-96), only resourceId/entityId are forged.
- **Why QA/Playwright/manual missed it:** The UI page always constructs the correct sessionCtx server-side and passes it down, so every Playwright/manual flow exercises only honest values — page tests pass. Exploitation requires hand-crafting the Server Action POST payload with a forged ctx object; typecheck/build cannot detect a trust-boundary violation because the type is satisfied either way.
- **Recommended action:** Inside sendAriaMessage, re-derive personId/role/legalEntityId from await auth() (or getCurrentUser()) and IGNORE the client ctx for all identity-bearing fields; keep only non-identity prefs (language) from the client. Apply the same in submitConfirmedLeaveRequest and pass the server-derived ctx to handleIntent so the requireRole gate cannot be spoofed.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** Yes
- **Test coverage required before accept:** Integration test: forge sessionCtx.personId to another employee and ctx.role='HR_ADMIN'; assert leave is created for the SESSION person (not forged) and that COMPLIANCE_QUERY is denied for a real EMPLOYEE regardless of forged ctx.role.

##### `P3-A3` · getExpiryAlerts/getComplianceData/getKnowledgeSources/getPeopleStats have no auth/role gate; getExpiryAlerts returns company-wide passport/visa/EID PII

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** CRITICAL
- **Area:** ARIA, Notification outbox, Employee Letters
- **Evidence:** modules/aria/os-actions.ts: getExpiryAlerts (line 38) — no getCurrentUser()/requireRole; queries persons for passport/visa/emirates_id expiry company-wide (lines 45-72) and returns employeeName+expiryDate for up to 200 people plus contract data. getComplianceData (line 321) — no auth; returns org-wide compliance + emiratisation. getKnowledgeSources (line 535) — no auth. getPeopleStats (line 175) — no auth (only optional managerId scoping the query if a caller chooses to pass it). Only getWorkflowPipeline (line 248: const user = await getCurrentUser(); role filter at 283-285) and getAuditLogEntries (line 469-472: role check) are gated. All four ungated functions are 'use server' (file header line 1) and thus directly invocable by any authenticated session.
- **Why QA/Playwright/manual missed it:** These power the ARIA OS admin panels which are only reachable by admins through the /aria middleware gate (middleware.ts:89-92), so UI navigation tests never call them as a non-admin. But a 'use server' action is callable by ANY authenticated user (incl. EMPLOYEE) by replaying the action endpoint — middleware route-gating does not protect Server Actions invoked from other contexts. Build/typecheck cannot see a missing auth call.
- **Recommended action:** Add const user = await getCurrentUser() + requireRole(['HR_ADMIN','HR_DIRECTOR','SUPER_ADMIN']) (and MANAGER-scoped variant where appropriate, e.g. getPeopleStats already supports managerId) at the top of getExpiryAlerts, getComplianceData, getKnowledgeSources, and getPeopleStats. getExpiryAlerts must also entity-scope for non-SUPER_ADMIN.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** Yes
- **Test coverage required before accept:** Unit/integration: invoke each of the four actions with an EMPLOYEE session and assert FORBIDDEN/empty; assert HR sees data and a cross-entity HR_ADMIN cannot see another entity's expiry PII.

##### `P2-P1` · WPS SIF generation can never succeed — IBAN/bankCode never populated on payroll_results

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** CRITICAL
- **Area:** Payroll (WPS/EOSB/GPSSA/DEWS)
- **Evidence:** modules/payroll/actions.ts calculatePayrollRun fetches employees (lines 283-300) WITHOUT iban/bankCode and inserts payroll_results (lines 369-407) with no iban/bankCode fields. grep shows personBankDetails is NEVER referenced anywhere in modules/payroll (0 matches). generateWpsSif reads payrollResults.iban/bankCode (actions.ts:700-701) which are therefore always NULL. validateWpsRecords (calculation-engine.ts:234) rejects any record where !rec.iban || iban.trim().length<15, so validation.isValid is false (actions.ts:734) and generateWpsSif throws 'WPS validation failed' (line 736) for every employee. The whole WPS pipeline (the legally-mandated UAE pay channel, BR-WPS-001) cannot produce a SIF.
- **Why QA/Playwright/manual missed it:** Unit tests (tests/unit/payroll-engine.test.ts) test the pure engine functions with hand-built inputs that include iban; they never exercise calculatePayrollRun→generateWpsSif against a real DB. The WPS page renders preview from wps_sif_records which is only populated after a successful generateWpsSif, so a page test on an empty/seeded table never trips it. No integration test drives DRAFT→...→SIF_GENERATED end-to-end with real bank data.
- **Recommended action:** In calculatePayrollRun, join person_bank_details (primary/isWpsAccount row) per employee, decrypt iban via lib/encryption.ts, and persist iban + bankCode (routing) onto payroll_results; or have generateWpsSif read person_bank_details directly at SIF time. Add an integration test covering DRAFT→SIF_GENERATED.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** Yes
- **Test coverage required before accept:** Integration test: seed person_bank_details (encrypted iban) + active employees, run calculatePayrollRun then generateWpsSif, assert wps_sif_records rows created with correct iban/routing and run.status='SIF_GENERATED'.

#### — HIGH —

##### `P3-A2` · handleLeaveRequestStatus resolves arbitrary employee by name/number with no role check

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** HIGH
- **Area:** ARIA, Notification outbox, Employee Letters
- **Evidence:** modules/aria/services.ts:592-640: when entities.target_person_id is set, the handler does a persons lookup with or(eq(personNumber,...), ilike(firstNameEn,'%ref%'), ilike(lastNameEn,'%ref%')) (lines 614-623), sets targetPersonId = found.id (line 636), then calls listLeaveRequests({personId: targetPersonId}) (line 642) and returns dates/type/status. There is NO requireRole / manager-scope / same-person check anywhere in this handler — contrast COMPLIANCE_QUERY/WORKFLOW_QUERY/TEAM_QUERY which call requireRole at services.ts:949-962. Combined with P3-A1 (forgeable ctx.role), or even as a plain EMPLOYEE (no gate at all on this intent), any caller can read another employee's leave history by typing a name.
- **Why QA/Playwright/manual missed it:** Requires the LLM intent classifier to emit target_person_id, which only happens when a user phrases 'show X's leave'. Demo/E2E ARIA flows query the caller's own balance, so the cross-person branch is never exercised. No type error since listLeaveRequests accepts any personId string.
- **Recommended action:** Gate the target_person_id branch behind requireRole(ctx, MANAGER_ROLES) AND, for MANAGER, restrict the resolved person to the manager's getManagerTeamIds scope; for EMPLOYEE, ignore target_person_id entirely (self only). Use server-derived role (per P3-A1).
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** Yes
- **Test coverage required before accept:** Test that an EMPLOYEE asking for another person's leave returns only their own (or a forbidden message), and a MANAGER can only see direct/indirect reports.

##### `P3-A5` · requestLetter takes personId from formData and never compares to the caller's own resolved personId

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** HIGH
- **Area:** ARIA, Notification outbox, Employee Letters
- **Evidence:** modules/employee-letters/actions.ts:731-848: requestLetter does requireRole(['EMPLOYEE','HR_ADMIN','HR_DIRECTOR','SUPER_ADMIN']) (line 740) then reads input.personId straight from formData via EssRequestSchema (lines 717,742-746) and uses it as the letter subject for getPersonWithDetails(input.personId) and the insert (lines 767,806,decoded into employeeLetters.personId). There is NO comparison of input.personId to session.personId. An EMPLOYEE can POST any UUID as personId and generate (and auto-PDF, lines 838-841) another employee's salary certificate / employment letter — which contains salary PII. Contrast app/api/employee-letters/download-my and getLetterDocumentUrl which bind to the resolved identity; this write path does not.
- **Why QA/Playwright/manual missed it:** The ESS form always sets personId to the logged-in employee's own id from server-rendered props, so UI tests submit the correct id and pass. The forged-personId attack requires editing the Server Action FormData. Zod only validates that personId is a uuid, not that it is the caller's — so no validation/type failure.
- **Recommended action:** For EMPLOYEE role, ignore the client personId and force input.personId = session.personId (throw if unset). Only HR_ADMIN/HR_DIRECTOR/SUPER_ADMIN may pass an arbitrary personId, and those should additionally be entity-scoped.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** No
- **Test coverage required before accept:** Integration: EMPLOYEE requestLetter with personId of a different employee → letter is created for the SESSION person (or rejected), never for the forged target.

##### `P3-M-FALLBACK-EMAIL` · sendLetterEmailAction hard-codes a personal fallback email and sends PII letters there when no work email

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** HIGH
- **Area:** ARIA, Notification outbox, Employee Letters
- **Evidence:** modules/employee-letters/actions.ts:202-206: const FALLBACK_EMAIL = 'd.kethari@avaniis.example'; const email = rawEmail ?? FALLBACK_EMAIL. When getPersonEmail (queries.ts:226-238, WORK_EMAIL only) returns null, the letter email — which carries letterNumber and an attached PII letter (salary certificate, employment letter) — is sent to a hardcoded individual's mailbox (lines 233-247). recipientName is prefixed '[FALLBACK — no employee email]' (line 235) but the document still leaves the org boundary to one person's address. emailRecipient is then persisted (line 258) and audited (line 275).
- **Why QA/Playwright/manual missed it:** Seeded test persons have WORK_EMAIL set, so rawEmail is non-null and the fallback branch never runs in tests. It is a one-line constant that compiles fine. Only triggers in production for employees lacking a work email.
- **Recommended action:** Remove the hardcoded personal address. If no work email, FAIL the send (return {success:false, error:'No work email on record'}) and set emailStatus='FAILED' / leave status unchanged, OR route to a configured per-entity HR mailbox column — never a literal personal address. Treat as a data-handling/PII-leak fix.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** No
- **Test coverage required before accept:** Unit: person with no WORK_EMAIL → send returns failure (or routes to configured entity mailbox), and the hardcoded address is never used.

##### `P2-L1` · absenceBalances.pendingDays is never incremented — balance gate cannot prevent over-committing concurrent/sequential pending requests

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** HIGH
- **Area:** Absence / Leave
- **Evidence:** Full-repo grep of `pendingDays` assignments shows it is ONLY ever decremented and NEVER incremented: createLeaveRequest (modules/absence/actions.ts:432-458) inserts the absence_entries row with NO write to absenceBalances at all; submitLeaveRequest (actions.ts:617-627) only sets status='PENDING', no balance write; the ONLY writes to absenceBalances.pendingDays are decrements — cancelLeaveRequest (actions.ts:1015 `Math.max(0, Number(bal.pendingDays) - duration)`) and decideLeaveRequest APPROVED branch (actions.ts:1176 `newPending = Math.max(0, Number(bal.pendingDays) - dur)`). Accrual (services.ts:276,318,334) only reads existing pendingDays or seeds it to 0. The create-time balance gate (actions.ts:374-408) computes `available = computeClosingBalance({... pendingDays: Number(bal.pendingDays) ...})` where pendingDays is structurally always 0 — services.ts:59-67 subtracts pendingDays in the formula, and the docstring at services.ts:56-57 explicitly claims pendingDays 'must reduce the available balance so back-to-back submissions don\'t double-spend'. Because nothing ever populates it, the gate only protects against already-APPROVED days (takenDays); an employee can file many DRAFT/PENDING requests that in aggregate exceed their balance, each passing the gate independently. DB CHECK (0006_sprint5_check_and_unique.sql:47-55) allows closing_balance_days to go negative, so no DB error surfaces. ARIA-LOCK (actions.ts:259-261) serialises per-person create but does not fix this — it serialises the SAME broken read (pending always 0), so even serialised submissions all see 0 reserved.
- **Why QA/Playwright/manual missed it:** Typecheck/build pass because the code is type-correct (it reads a real column). Unit/integration tests assert the decrement path and the single-request gate, but no test files two sequential pending requests that together exceed balance and asserts the second is blocked — the documented intent (pending reduces available) is never exercised end-to-end. Playwright UI tests file one request at a time within balance, so the missing reservation is invisible. The bug only manifests with 2+ outstanding pending requests or a request that exceeds remaining-after-pending balance.
- **Recommended action:** Increment absenceBalances.pendingDays by durationDays inside the submitLeaveRequest outer transaction (DRAFT/REJECTED→PENDING transition) and recompute closingBalanceDays in the same tx with audit; alternatively increment at createLeaveRequest if DRAFT should reserve. Ensure the gate in createLeaveRequest reads the reserved value. Add regression tests: (a) two pending requests exceeding balance → second blocked; (b) pending request reduces available shown to a concurrent create. Verify decrement-on-cancel/reject also runs for the PENDING→REJECTED path (see P2-M re-submit/decide interactions).
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** Yes
- **Test coverage required before accept:** Integration: sequential over-commit of two pending requests blocked at the second; cancel/reject releases the reserved pendingDays; approval moves pending→taken with net-zero double count. Unit: computeClosingBalance correctly reflects a non-zero pendingDays after submit.

##### `P3-D2` · feature_permissions matrix is never enforced at runtime (no requirePermission/canPerform resolver)

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** HIGH
- **Area:** Auth/RBAC, DataOps console, Documents/Storage
- **Evidence:** grep across lib/ modules/ app/ for requirePermission|canPerform|hasFeaturePermission|checkFeaturePermission returns ZERO resolver definitions. The only references to featurePermissions/employeePerms/managerPerms/hrAdminPerms are: modules/access/actions.ts:12-19 (listFeaturePermissions read) and :30-58 (saveFeaturePermissions CRUD write), and the editor UI app/(hr-admin)/access/feature-permissions/_FeaturePermissionsClient.tsx:25-77. No server action or lib reads these columns to gate an action. All RBAC is actually enforced by requireRole() (lib/auth.ts:516) + middleware path gates only. CLAUDE.md's claim 'a new permission = insert one feature_permissions row (zero code)' is false — toggling the matrix changes nothing at runtime.
- **Why QA/Playwright/manual missed it:** The permissions admin page renders and saves correctly (UI + CRUD round-trip passes Playwright). Nothing in the test suite asserts that flipping a matrix cell actually denies/permits an operation, so the absence of an enforcement layer is undetectable from green tests. It is a missing-feature gap, not a crash.
- **Recommended action:** Either implement a resolver (e.g. lib/auth.ts requirePermission(featureKey, action) that reads feature_permissions by role and throws FORBIDDEN) and call it in the relevant server actions, or correct CLAUDE.md and the feature-permissions UI to state the matrix is advisory/not enforced. Until then treat the matrix as non-functional security theatre.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** Yes
- **Test coverage required before accept:** Integration tests proving a matrix toggle (e.g. employee export=false) actually blocks the corresponding action; until a resolver exists, a test asserting that NO code path consumes the perm columns (documenting the gap).

##### `P3-D3` · DataOps writes bypass PII encryption, effective-date, and main audit_log; DELETE hard-deletes HR rows

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** HIGH
- **Area:** Auth/RBAC, DataOps console, Documents/Storage
- **Evidence:** execute/route.ts:24 `rawSql.unsafe(sql)` runs arbitrary INSERT/UPDATE/DELETE for SUPER_ADMIN with NO encryption of iban/emirates_id/passport (lib/encryption.ts never imported). rows/route.ts:164 raw INSERT, [id]/route.ts:51 raw UPDATE, both with plaintext values and no effective-date close+open (lib/effective-date.ts not used). [id]/route.ts:131-134 DELETE issues `DELETE FROM <table> WHERE pk = $1` — a hard delete (optional archive copy at :124-129 only if a *_archive table exists), violating ADR-001 rule 2 (HR records never deleted). All DataOps audit goes to dataops.audit_log (execute:34, rows:107/168, [id]:59/136) — a SEPARATE table, not the main audit_log consumed by the compliance/audit module.
- **Why QA/Playwright/manual missed it:** This is the documented purpose of a raw DB console (SUPER_ADMIN-only break-glass), so it 'works as built' and passes tests. Typecheck/build never flag a policy violation. No test asserts that DataOps writes encrypt PII or write to the canonical audit_log, and the console is gated to a single trusted role, so manual QA treats it as admin tooling rather than an app write path.
- **Recommended action:** Business decision: confirm DataOps is intended break-glass tooling. If so, document that it bypasses encryption/effective-date/main-audit and restrict to emergency use with mandatory snapshot + alerting; consider forwarding dataops.audit_log into the main audit trail. If HR PII columns can be edited, they must be encrypted on write — add an encrypt step or block edits to known-encrypted columns (iban/emirates_id/passport). Replace hard DELETE with an effective-date close, or block DELETE on effective-dated HR tables.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** Yes
- **Test coverage required before accept:** Tests: editing person_bank_details.iban via DataOps stores ciphertext not plaintext; DELETE on an effective-dated HR table is rejected or soft-closes; a DataOps mutation produces a record discoverable by the main audit module.

##### `P2-P2` · IBAN stored in plaintext-sized columns on payroll_results / wps_sif_records (no encryption)

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** HIGH
- **Area:** Payroll (WPS/EOSB/GPSSA/DEWS)
- **Evidence:** drizzle/schema/foundation.ts:1280 payroll_results.iban = varchar('iban', {length:23}); transactions.ts:223 wps_sif_records.iban = varchar('iban',{length:23}).notNull(). By contrast foundation.ts:535 person_bank_details.iban = varchar('iban',{length:500}) with comment 'AES-256-GCM encrypted ciphertext'. AES-256-GCM ciphertext (iv+tag+base64) far exceeds 23 chars, so 23-char columns can only hold cleartext. grep confirms NO encrypt/decrypt/encryption import anywhere in modules/payroll. CLAUDE.md Rule 3 requires PII (iban) encrypted before persist. Currently the write path is broken (P2-P1) so nothing is stored yet, but once wired the schema forces plaintext IBAN persistence — a PII-at-rest violation in payroll_results and wps_sif_records.
- **Why QA/Playwright/manual missed it:** The columns are currently always NULL/empty because the write path never populates them (P2-P1), so no test ever inspects a stored IBAN's length or ciphertext. Typecheck/build can't detect a semantic encryption-vs-plaintext requirement. The plaintext-vs-ciphertext mismatch only manifests when real bank data flows.
- **Recommended action:** Decide WPS encoding: SIF banking files require cleartext IBAN at generation time, but at-rest storage should be encrypted. Either widen these columns to varchar(500) and store AES-256-GCM ciphertext (decrypt only when emitting the SIF), or do not persist IBAN on payroll_results/wps_sif_records at all and re-read+decrypt from person_bank_details at SIF emit time. Align with CLAUDE.md Rule 3.
- **Schema change required:** Yes · **Data migration/backfill:** No · **Affects other modules:** No
- **Test coverage required before accept:** Unit/security test asserting any persisted IBAN on payroll_results/wps_sif_records is ciphertext (not matching the AE\d{21} cleartext pattern) OR that IBAN is never persisted on those tables.

##### `P2-P3` · Cross-entity payroll disclosure — getPayrollRunById and run detail page never assert actor entity == run entity

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** HIGH
- **Area:** Payroll (WPS/EOSB/GPSSA/DEWS)
- **Evidence:** modules/payroll/queries.ts:132-139 getPayrollRunById filters ONLY by payrollRuns.id and payrollRuns.tenantId — no legalEntityId scope. The detail page app/(hr-admin)/payroll/runs/[runId]/page.tsx:74-85 calls only auth()+redirect('/sign-in'), then getPayrollRunById/getPayrollResultRows/getVarianceReport by runId with NO comparison of session.user.legalEntityId to run.legalEntityId (and no requireRole on the page at all). getPayrollResultRows (queries.ts:171-174) and getVarianceReport (501-505) likewise scope only by payrollRunId+tenantId. So any authenticated user who can reach the route, with a runId from any legal entity in the tenant, sees that entity's salaries/IBANs/net pay. Mutation actions (calculatePayrollRun, lockPayrollRun, approvePayrollRun, generateWpsSif, confirmPayrollRun) call requireRole([...]) by ROLE only (e.g. actions.ts:262) and never compare actor entity to run.legalEntityId — so a role-holder in entity A can also mutate entity B's run by runId. Contrast: the WPS page (wps/page.tsx:38,56) correctly scopes its list by session.user.legalEntityId, showing the intended pattern is missing on the run-detail/query path.
- **Why QA/Playwright/manual missed it:** Page/Playwright tests sign in as a single seeded entity and navigate via UI links, which only ever supply runIds belonging to that same entity, so the missing cross-entity guard never fires. Exploiting it requires hand-crafting a runId from a different entity in the same tenant. Typecheck/build cannot detect a missing authorization predicate.
- **Recommended action:** Add legalEntityId scoping: pass the actor's entity into getPayrollRunById (and result/variance queries) and filter eq(legalEntityId, actor.entityId), OR in the page/actions compare run.legalEntityId to session.user.legalEntityId and 404/FORBIDDEN on mismatch (with a SUPER_ADMIN/HR_DIRECTOR cross-entity allowance if that is the business rule). Mirror the wps/page.tsx pattern.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** Yes
- **Test coverage required before accept:** Integration test: actor in entity A requests a runId in entity B → expect not-found/forbidden for getPayrollRunById and for each mutation action; SUPER_ADMIN allowed if intended.

##### `P2-P4` · run_number global UNIQUE collides across entities — per-entity MAX + per-entity advisory lock can mint duplicate PR-000001

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** HIGH
- **Area:** Payroll (WPS/EOSB/GPSSA/DEWS)
- **Evidence:** drizzle/schema/foundation.ts:1209 runNumber = varchar('run_number',{length:30}).notNull().unique() and migration drizzle/migrations/0000_outgoing_tusk.sql:937 CONSTRAINT payroll_runs_run_number_unique UNIQUE(run_number) — a GLOBAL unique on run_number alone (no legal_entity_id in the key). But nextRunNumber (actions.ts:84-90) computes MAX(run_number) filtered by eq(legalEntityId, legalEntityId) AND tenantId, and the advisory lock key is per-entity: sql`pg_advisory_xact_lock(hashtext('payroll_run:' || legalEntityId))` (actions.ts:81-82). Therefore entity A and entity B each independently derive seq=1 → both attempt 'PR-000001'. The per-entity advisory lock does NOT serialise across different entities, so two concurrent createPayrollRun calls for different entities both pass, and the second insert violates the global unique constraint → Postgres 23505, surfaced raw as err.message (actions.ts:254).
- **Why QA/Playwright/manual missed it:** tests/integration/payroll-collision.test.ts (PAY-001..006) tests SAME-entity concurrency (RISK-PAYROLL-2), which the per-entity lock correctly handles, so those pass. Cross-entity collision needs two entities each at the same sequence number created concurrently — not exercised. Single-entity dev/UAT data never produces two entities at the same MAX. Typecheck/build can't see the scope mismatch between the SQL constraint and the application MAX query.
- **Recommended action:** Make the run-number namespace consistent with its derivation: either (a) drop the global UNIQUE and add a composite UNIQUE(tenant_id, legal_entity_id, run_number), or (b) make run numbers globally unique (prefix with entity code or use a global sequence) so the per-entity MAX matches the constraint. Catch 23505 and surface a friendly bilingual message either way.
- **Schema change required:** Yes · **Data migration/backfill:** No · **Affects other modules:** No
- **Test coverage required before accept:** Integration test: concurrent createPayrollRun for two different entities both at sequence 1 → assert both succeed with the corrected constraint (or both produce distinct numbers).

##### `P2-T3` · No self-approval guard — submitter not excluded from chain; actor==initiator allowed

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** HIGH
- **Area:** Timesheets + Workflow approval engine
- **Evidence:** lib/workflow-hierarchy.ts resolveApprovalChain (452-581) never excludes submitterPersonId; LINE_MANAGER/POSITION resolvers can return the submitter when they are top-of-chain (e.g. entity head whose lineManagerId is null → level -2 returns the submitter; or a self-referential lineManagerId). lib/workflow-engine.ts takeWorkflowAction authorisation (962-971) only checks assignedToPersonId===actorPersonId || delegatedToPersonId===actorPersonId || privileged role — there is NO actorPersonId !== inst.initiatedByPersonId check. So if a person is resolved as approver of their own request, they can approve it.
- **Why QA/Playwright/manual missed it:** Test fixtures use distinct submitter and manager, so the submitter never lands in their own chain. The guard gap only triggers for top-of-hierarchy employees or misconfigured self-managing rows, which seed data avoids. No type/build signal.
- **Recommended action:** In resolveApprovalChain skip any resolved approver whose personId===submitterPersonId (or escalate one level up); additionally add an explicit `actorPersonId === inst.initiatedByPersonId` rejection in takeWorkflowAction as defence-in-depth.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** Yes
- **Test coverage required before accept:** Integration: submitter who is entity head → chain excludes self; attempt to approve own instance → 'cannot approve your own request'.

##### `P2-T5` · createManualAttendance/approveManualAttendance no entity scoping; attendance_records has no legal_entity_id

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** HIGH
- **Area:** Timesheets + Workflow approval engine
- **Evidence:** drizzle/schema/timesheets.ts attendanceRecords (42-73) has tenant_id and person_id but NO legal_entity_id column (grep of schema + migrations confirms none). modules/timesheets/actions.ts createManualAttendance (350-435) requireRole(['HR_ADMIN','HR_DIRECTOR','SUPER_ADMIN','MANAGER']) then inserts for any params.personId with no check that the person belongs to the actor's legalEntityId and (for MANAGER) no check the person is a direct report. approveManualAttendance (439-479) updates by id+tenantId only — any MANAGER/HR can approve any record across entities. Contrast getTeamAttendance (251-260) which DOES scope MANAGER to direct reports — the write paths do not.
- **Why QA/Playwright/manual missed it:** UI passes the personId the admin selected from their own scoped list, so the page test always acts within scope. Cross-entity abuse requires a forged personId in the Server Action arg, which Playwright/manual never sends. No legal_entity_id means even a scoping attempt has nothing to compare against — invisible to schema/typecheck.
- **Recommended action:** Add legal_entity_id to attendance_records (or join persons.legalEntityId) and enforce: non-SUPER_ADMIN actor's legalEntityId must match the target person's; MANAGER limited to direct reports (mirror getTeamAttendance). Apply to createManualAttendance, approveManualAttendance, reviewExceptionRequest, processExcelUpload.
- **Schema change required:** Yes · **Data migration/backfill:** Yes · **Affects other modules:** No
- **Test coverage required before accept:** Integration: MANAGER creating/approving attendance for a person outside their reports/entity → FORBIDDEN; HR_ADMIN cross-entity → FORBIDDEN; SUPER_ADMIN allowed.

##### `P1-H7` · assignWorkSchedule trusts caller-supplied legalEntityId/workScheduleId with no active/entity validation

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** HIGH
- **Area:** Worker Assignments / Work Schedules / MDM
- **Evidence:** modules/core-hr/work-schedule-assignment-actions.ts:16-23 AssignSchema only validates personId/legalEntityId/workScheduleId as z.string().uuid(). Inside the transaction (lines 48-123) the values are inserted verbatim: line 81 legalEntityId: data.legalEntityId, line 82 workScheduleId: data.workScheduleId, line 99/104 audit entityId: data.legalEntityId. There is NO query verifying the workScheduleId exists, is isActive=true, is isDefault, belongs to legalEntityId, or that legalEntityId matches the person's persons.legalEntityId. Contrast with DepartmentActions assertWorkScheduleValid/assertHeadPersonValid described in CLAUDE.md. The legitimate UI path (app/(hr-admin)/persons/[id]/edit/PersonEditForm.tsx:450 passes legalEntityId derived from the page's scope.legalEntityId with a cross-entity guard at edit/page.tsx:54) always supplies the person's own entity, so page tests pass — but the Server Action itself performs no server-side re-derivation.
- **Why QA/Playwright/manual missed it:** Requires a forged Server Action argument (non-UI client). Typecheck/build pass because the Zod shape is valid. Playwright/manual UI tests always submit the page-derived correct legalEntityId, so the trust gap never manifests in the happy path. Cross-entity / inactive-schedule abuse only appears when a caller hand-crafts the action payload.
- **Recommended action:** Inside the transaction, SELECT persons.legalEntityId by data.personId and assert it equals data.legalEntityId (or derive entity from the person, ignoring caller value entirely, mirroring the BDP-009 'use DB entity not caller entity' pattern). Also SELECT work_schedules by workScheduleId asserting isActive=true and legalEntityId matches (or is global null). Throw a typed error on mismatch.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** Yes
- **Test coverage required before accept:** Unit/integration: forged payload with (a) workScheduleId from a different entity, (b) inactive schedule, (c) legalEntityId not matching person's entity — all must be rejected; valid same-entity active schedule must pass.

#### — MEDIUM —

##### `P3-A4` · completeLetterSigning ownership guard is gated behind 'if (session)' and short-circuits on null personId

- **Classification:** PARTIALLY_REAL
- **Severity (verified):** MEDIUM
- **Area:** ARIA, Notification outbox, Employee Letters
- **Evidence:** modules/employee-letters/actions.ts:510-548: completeLetterSigning calls getCurrentUser() then validates ownership only inside if (session) {...} (line 538), with the inner condition `if (sessionPerson && session.personId && session.personId !== letter.personId)` (line 545). Two real weaknesses: (1) if session.personId is undefined/null the && short-circuits and ANY authenticated user can sign as anyone — session.personId is typed string|undefined in lib/auth.ts:29,42,336 and can legitimately be unset (auth.ts:303-321 first-time SSO with no DB row). (2) sessionPerson (lines 539-543) is just SELECT persons WHERE id = letter.personId — it always resolves, so it adds nothing. HOWEVER the audit's CRITICAL premise ('public no-auth route, getCurrentUser() is null, anyone with token signs') is FALSE: /letters/sign/[token] is NOT in middleware.ts isPublic (middleware.ts:104-115), so an unauthenticated request (and the Server Action POST) is redirected to /sign-in (middleware.ts:118-124) — getCurrentUser() will not be null for a reachable request. Token controls ARE present: expiry checked (actions.ts:533, page.tsx:30), single-use (signingToken nulled actions.ts:560, SIGNED-status reject actions.ts:532). No rate-limit on token guessing, but token is 64-hex/256-bit (sendSignRequest actions.ts:377) — effectively unguessable. PCL triggers finalizeProbationAfterSigning (actions.ts:620-625) as claimed.
- **Why QA/Playwright/manual missed it:** The authenticated ESS happy path always has a bound personId equal to letter.personId, so the guard passes and tests are green. The null-personId bypass needs an authenticated account whose JWT lacks personId (edge SSO state) — never produced by seeded dev accounts. The 'public route' assumption was never tested because middleware silently redirects.
- **Recommended action:** Make the guard mandatory and fail-closed: require a non-null session.personId and require session.personId === letter.personId (or an explicit HR override role) BEFORE allowing signing; remove the meaningless sessionPerson lookup. Do not predicate the check on `if (session)`.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** Yes
- **Test coverage required before accept:** Tests: (a) authenticated user with personId != letter.personId is rejected; (b) authenticated user with personId == null is rejected (not allowed to sign); (c) unauth POST to the signing action is blocked by middleware.

##### `P3-M-DOWNLOAD-SCOPE` · HR letter download route is role-gated but not legalEntity-scoped (sibling getLetterDocumentUrl is)

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** MEDIUM
- **Area:** ARIA, Notification outbox, Employee Letters
- **Evidence:** app/api/employee-letters/download/route.ts:24-40: checks session role in ['HR_ADMIN','HR_DIRECTOR','SUPER_ADMIN'] (line 27) then loads the letter by id (lines 35-39) with WHERE tenant_id + id only — there is NO check that letter.legalEntityId === session.user.legalEntityId. Any HR-group user can download any letter (incl. salary certificates) of any entity by guessing/iterating the id. The sibling getLetterDocumentUrl in modules/employee-letters/actions.ts:1009-1014 explicitly throws 'FORBIDDEN: cross-entity letter access denied' when user.role !== SUPER_ADMIN && user.legalEntityId !== letter.legalEntityId — proving the intended contract and the divergence.
- **Why QA/Playwright/manual missed it:** Single-entity seed data means cross-entity access never appears in tests; the route returns a valid PDF for the test admin's own letters so functional tests pass. Multi-entity HR isolation is not exercised. No type/build signal.
- **Recommended action:** Mirror getLetterDocumentUrl: after loading the letter, if session.user.role !== 'SUPER_ADMIN' && session.user.legalEntityId !== letter.legalEntityId return 403. Also write a LETTER.PDF_DOWNLOADED audit even on the cloud/base64 branch (currently only on regeneration).
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** No
- **Test coverage required before accept:** Integration: HR_ADMIN of entity A requesting a letter belonging to entity B receives 403; SUPER_ADMIN succeeds.

##### `P2-L3` · assertCanRequestLeaveFor returns early for HR roles with no active/assignmentStatus check; createLeaveRequest never validates target person is active

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** MEDIUM
- **Area:** Absence / Leave
- **Evidence:** lib/leave-person-scope.ts:185-186 `if (HR_ROLES.has(user.role)) return` — HR_ADMIN/HR_DIRECTOR/SUPER_ADMIN are authorised for ANY targetPersonId with zero isActive or assignmentStatus check. In createLeaveRequest the only person read inside the tx is loadPersonScope (actions.ts:83-93, called 263) which selects only {id, legalEntityId, gender} — it does NOT read isActive or worker_assignments.assignmentStatus, and there is no guard rejecting a terminated/inactive person. The backdate pre-flight (actions.ts:162-167) also reads only legalEntityId. Note the HR person-OPTIONS picker (leave-person-scope.ts:138 `eq(persons.isActive, true)`) does filter inactive employees out of the UI list, but the server action guard does not — a forged personId of a terminated employee passes. This is narrower than a cross-role escalation: it requires an HR-role caller (legitimately high-privilege) supplying an inactive person's id directly, so impact is a data-integrity/policy gap (filing leave for terminated staff), not privilege escalation.
- **Why QA/Playwright/manual missed it:** UI always sources personId from the active-only picklist (leave-person-scope.ts:138), so page/Playwright tests never submit an inactive person's id and the missing server-side active-check is invisible. Exploiting it requires a forged Server Action argument bypassing the UI list. Typecheck/build are unaffected.
- **Recommended action:** In createLeaveRequest, extend loadPersonScope to also read persons.isActive and the current worker_assignments.assignmentStatus, and throw a bilingual PERSON_INACTIVE error when isActive=false or assignmentStatus!='ACTIVE' (mirror the department-head active gate already used elsewhere). Keep HR cross-entity authority but reject inactive targets for all roles.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** Yes
- **Test coverage required before accept:** Integration: HR_ADMIN filing for a terminated/inactive person (forged id) is rejected; active person still succeeds; EMPLOYEE self/manager-team paths unchanged.

##### `P2-M-cross-year` · Balance lookups key on Number(startDate.slice(0,4)); a Dec→Jan leave debits only the start-year balance row

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** MEDIUM
- **Area:** Absence / Leave
- **Evidence:** All three balance lookups key the balance_year solely on the leave's startDate year: createLeaveRequest gate `const balYear = Number(data.startDate.slice(0, 4))` (actions.ts:355); cancel restore `eq(absenceBalances.balanceYear, Number(row.startDate.slice(0, 4)))` (actions.ts:1008); decide/approve `eq(absenceBalances.balanceYear, Number(row.startDate.slice(0, 4)))` (actions.ts:1170). durationDays is the full inclusive span (services.ts:132). A request spanning e.g. 2025-12-29→2026-01-04 debits/credits only the 2025 balance row for ALL days, never splitting the January days to the 2026 row. The ESS page independently filters balances on currentYear only (me/leave/page.tsx:47), reinforcing the single-year assumption.
- **Why QA/Playwright/manual missed it:** Year-boundary leave is a rare edge case; unit/integration fixtures and Playwright flows use within-year dates, so the start-year-only debit always matches expectations. Typecheck/build unaffected. Only a Dec→Jan request exposes the mis-attribution.
- **Recommended action:** Decide the business rule (UAE practice typically attributes leave to the year in which each day falls). If split-by-year is required, debit each year's balance row for that year's portion of the span inside the same transaction; otherwise document the start-year attribution rule explicitly. Coordinate with P2-L1 reservation fix since both touch the balance write path.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** No
- **Test coverage required before accept:** Integration: a Dec→Jan request correctly debits both years' balance rows (or, if start-year rule confirmed, an assertion test pinning that rule).

##### `P3-D1` · DataOps read/nl2sql/saved-queries/execute(SELECT) routes use only getCurrentUser(); role enforcement relies on middleware; access-policy row filter is dead code

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** MEDIUM
- **Area:** Auth/RBAC, DataOps console, Documents/Storage
- **Evidence:** execute/route.ts:12-13 `getCurrentUser()` then `canWrite = user.role === 'SUPER_ADMIN'` (no requireRole); nl2sql/route.ts:12 `await getCurrentUser()` only; saved-queries/route.ts:16,37 GET+POST `await getCurrentUser()` only; schema/route.ts:9 `getCurrentUser()` only; audit/route.ts:8 `getCurrentUser()` only; rows/route.ts:27 GET `getCurrentUser()` only (no role gate) while POST:138, [id]/route.ts PATCH:19 + DELETE:81, snapshot/route.ts:20 DO re-check `user.role !== 'SUPER_ADMIN'`. The ONLY role gate for reads is middleware.ts:38-41 (`/api/dataops` → allowed:['SUPER_ADMIN']). Because middleware admits only SUPER_ADMIN, access-policy.ts resolveDataAccessRole():127 returns 'SUPER_ADMIN' → isTableVisible():137 returns true and buildRowFilter():180 returns null. The EMPLOYEE/MANAGER/HR_ADMIN_GROUP branches in access-policy.ts:188-214 are therefore unreachable = dead code under current middleware.
- **Why QA/Playwright/manual missed it:** Typecheck/build pass because the code compiles; Playwright role specs only assert SUPER_ADMIN can reach /admin/dataops and lower roles get redirected — they never exercise the API handlers with a non-SUPER_ADMIN session, so the missing in-handler gate is invisible. The dead-code row filter looks like working defense-in-depth in review.
- **Recommended action:** Add an explicit `await requireRole(['SUPER_ADMIN'])` at the top of every /api/dataops read handler (execute, nl2sql, saved-queries GET/POST, schema, audit, rows GET) so the API is self-protecting if middleware matcher ever changes. Either wire access-policy row filtering to a real lower-privilege entry point or delete it and the team-lookup dependency as dead code to avoid a false sense of layered security.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** Yes
- **Test coverage required before accept:** Integration test: call each /api/dataops read route with a forged HR_ADMIN/MANAGER session and assert 403 (currently would 200 if middleware bypassed). Test that access-policy branches are either reachable or removed.

##### `P3-M(MIME)` · validateFile checks client MIME only; /api/documents/[id] serves stored mimeType inline with no X-Content-Type-Options: nosniff → stored XSS via self-upload

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** MEDIUM
- **Area:** Auth/RBAC, DataOps console, Documents/Storage
- **Evidence:** modules/core-hr/documents/actions.ts:69-81 validateFile only checks `file.type` (client-controlled) against ALLOWED_DOCUMENT_MIME_TYPES — no magic-byte/content sniff; stored mimeType = file.type (actions.ts:120,273). app/api/documents/[id]/route.ts:218-222 sets Content-Disposition `inline` for mode=view and Content-Type = stored mimeType; the streaming branches (postgres :254-263 and /tmp :283-292) set NO `X-Content-Type-Options: nosniff` header. An employee can upload an .html/.svg payload labelled image/png, then open /api/documents/<id>?mode=view to get it served same-origin inline. NOTE narrower than full claim: the local public/uploads branch (:275) and cloud branch (:333) are 302 redirects (static/ signed URL) so the inline-XSS vector is limited to the postgres-bytea and /tmp serving branches.
- **Why QA/Playwright/manual missed it:** Requires a crafted malicious upload (forged MIME + active content) and manual navigation to the raw API URL — normal UI upload/preview of legitimate PDFs/images passes Playwright. No security test asserts the response carries nosniff or that magic bytes match the declared type. RISK-2G-001 (MIME magic bytes) was explicitly accepted/deferred in CLAUDE.md.
- **Recommended action:** Add `X-Content-Type-Options: nosniff` to every inline-serving response in the route; force Content-Disposition attachment (or a sandboxed Content-Security-Policy) for non-PDF/image types; add server-side magic-byte sniffing in validateFile to reject content/extension/MIME mismatch.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** No
- **Test coverage required before accept:** Security test: upload an HTML/SVG file with image/* MIME, fetch the view URL, assert response has nosniff and/or attachment disposition and is not rendered as HTML; magic-byte mismatch upload is rejected.

##### `P3-M(SQL-validator)` · sql-validator.ts is blocklist/regex-based; misses dblink/pg_read_server_files/current_setting/pg_ls_dir; dollar-quote/comment desync; substring schema match

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** MEDIUM
- **Area:** Auth/RBAC, DataOps console, Documents/Storage
- **Evidence:** lib/dataops/sql-validator.ts:5-20 BLOCKED_KEYWORDS lists DROP/TRUNCATE/ALTER/CREATE/GRANT/REVOKE/pg_sleep/pg_read_file/pg_write_file/COPY..PROGRAM/LO_IMPORT/LO_EXPORT but NOT dblink, pg_read_server_files, pg_ls_dir, current_setting, pg_settings — a SELECT can still read server files via pg_read_server_files() or enumerate dir via pg_ls_dir(). Schema block at :52-55 uses `stripped.toLowerCase().includes(schema)` which blocks literal 'pg_catalog'/'information_schema' substrings but pg_read_server_files() does not contain those names so it is allowed. stripStringLiterals():38 dollar-quote regex `/\$\$[\s\S]*?\$\$/g` only handles bare `$$`, not tagged `$tag$...$tag$`, so a tagged dollar-quoted body can desync keyword stripping. Multi-statement split at :59 is on naive `;` after stripping; comment/literal edge cases can leak.
- **Why QA/Playwright/manual missed it:** This is a SUPER_ADMIN-only console (middleware-gated), so the only actor who can hit it already has the highest privilege — exfiltration via pg_read_server_files is low marginal risk and not in any test. Unit tests likely assert DROP/DELETE-gating, not exotic read functions, so blocklist gaps pass. Validator changes don't affect typecheck/build.
- **Recommended action:** For a SUPER_ADMIN break-glass tool, document the trust model (a SUPER_ADMIN with raw SQL can already read anything they have DB grants for) so this is accepted risk; OR move to an allowlist approach (parse and permit only SELECT/known DML against known schemas), run DataOps under a least-privilege DB role that lacks pg_read_server_files/dblink, and fix the tagged-dollar-quote stripping.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** No
- **Test coverage required before accept:** Validator unit tests: pg_read_server_files/pg_ls_dir/dblink/current_setting are blocked; tagged dollar-quoted strings ($tag$...$tag$) containing DROP are still caught or rejected; multi-statement with comments is rejected.

##### `P1-H5` · Department parent_department_id has no transitive cycle prevention

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** MEDIUM
- **Area:** Departments / Positions / Org Chart
- **Evidence:** DepartmentActions.ts: createDepartment (line 173), updateDepartment (line 260), correctDepartment (line 405) call ONLY assertParentSameEntity(input.parentDepartmentId, input.legalEntityId). That helper (lines 87-101) checks only that the parent exists and shares the legal entity — no ancestor-chain walk. There is NO detectCircularChain equivalent for departments (contrast PositionActions.ts:142-161 which has one). Client-side DepartmentDrawer.tsx:208-210 filteredParents excludes ONLY direct self (d.id !== editRecord?.id) — A→B→A or longer chains are not blocked on client or server.
- **Why QA/Playwright/manual missed it:** Creating a multi-department cycle requires deliberately setting parent pointers in a loop across separate edit operations; normal UI usage and Playwright happy-path tests never construct a cycle. A cycle would surface only when a recursive department tree walk runs (org/reporting render) and either infinite-loops or hits a depth clamp.
- **Recommended action:** Add a server-side detectCircularChain-style ancestor walk for parentDepartmentId in updateDepartment/correctDepartment (mirror PositionActions.ts:142-161), throwing BR-DEPT-00x on cycle. Cap hops as a safety net.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** No
- **Test coverage required before accept:** Unit tests: A→B then attempt B→A must be rejected; 3-deep cycle A→B→C→A rejected; setting parent to self (server-side, bypassing client filter) rejected.

##### `P1-H6` · createPosition: bare insert + bare audit outside a transaction AND skips circular-chain check

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** MEDIUM
- **Area:** Departments / Positions / Org Chart
- **Evidence:** PositionActions.ts createPosition (lines 82-137): db.insert(positions) at line 94 and writeAuditLog at line 118 are TWO separate top-level awaits — no db.transaction wrapper (contrast updatePosition lines 200-249 which wraps both in db.transaction). Violates CLAUDE.md Hard Rule 1 (every DB write = transaction + audit in same tx). Also, createPosition never calls detectCircularChain — it accepts input.reportsToPositionId (line 107) with no validation, while updatePosition (lines 192-195) and correctPosition (lines 336-339) both call detectCircularChain. On create the new id does not yet exist so it cannot be in its own chain, but it CAN be set to report to a position that already (transitively) makes it part of a future cycle only after a subsequent edit — so the create-time gap is narrower; the missing transaction is the real defect.
- **Why QA/Playwright/manual missed it:** A crash strictly between the insert and the audit write is required to observe the orphaned-audit / missing-audit split; this never happens in a single-request happy-path test. Typecheck/build are unaffected. The circular gap on create is benign in practice because a brand-new id cannot be its own ancestor.
- **Recommended action:** Wrap createPosition's insert + writeAuditLog in a single db.transaction (pass tx to writeAuditLog) to match updatePosition. Circular check on create is low-priority since the new id cannot be in the chain.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** No
- **Test coverage required before accept:** Source-inspection test asserting createPosition uses db.transaction and passes tx to writeAuditLog.

##### `P1-L(disable/enable/correct audit)` · disableDepartment/enableDepartment/correctDepartment + disablePosition do bare write + audit outside a transaction

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** MEDIUM
- **Area:** Departments / Positions / Org Chart
- **Evidence:** DepartmentActions.ts: disableDepartment update at line 359 + writeAuditLog at 369 (no tx); enableDepartment update 491 + audit 501 (no tx); correctDepartment update 434 + audit 454 (no tx) AND no writeDepartmentHistory either. PositionActions.ts: disablePosition update 282 + audit 292 (no tx); correctPosition update 353 + audit 373 (no tx); enablePosition update 409 + audit 419 (no tx). By contrast updateDepartment (274) and updatePosition (200) DO wrap insert+history+audit in db.transaction. These bare paths violate CLAUDE.md Hard Rule 1.
- **Why QA/Playwright/manual missed it:** Same as P1-H6: the write and the audit are separate awaits, so only a crash between them leaves an inconsistent (state-changed-but-unaudited, or audited-but-not-committed) record. Single-request tests never crash mid-pair; typecheck/build unaffected.
- **Recommended action:** Wrap each of these six actions' state mutation + writeAuditLog (and correctDepartment's history) in a single db.transaction, passing tx to writeAuditLog/writeHistory, matching the update* pattern.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** No
- **Test coverage required before accept:** Source-inspection tests asserting disable/enable/correct for departments and positions wrap mutation+audit in db.transaction.

##### `P1-M(hiring/transfer scope)` · createHiringRequest/createTransferRequest do not validate positionId/departmentId belong to actor entity or exist

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** MEDIUM
- **Area:** Departments / Positions / Org Chart
- **Evidence:** org-chart-actions.ts createHiringRequest (lines 175-244): validates only input.positionId non-empty (189), requestType (190), justification length (191). It NEVER reads the positions/departments rows — inserts input.positionId/departmentId verbatim (198-199) with no entity scoping; a MANAGER could POST any position id from another legal entity. createTransferRequest (lines 260-338): reads the position only by id+tenant (line 276 eq(positions.tenantId,TENANT_ID), eq(positions.id,input.nodeId)) — no eq(positions.legalEntityId, user.legalEntityId). Role gate is coarse (allowedRoles includes MANAGER for both). MANAGER direct-report check (284-288) partly mitigates transfer for occupied positions, but hiring has no such scope and transfer targetDepartmentId/targetPositionId are never validated to exist or share the entity.
- **Why QA/Playwright/manual missed it:** Server Actions are normally invoked from the org-chart UI which always passes in-entity ids, so Playwright/page tests always pass correct values. Exploiting this needs a forged Server Action argument (cross-entity id) — not exercised by UI-driven tests. Multi-entity test data is also rarely seeded.
- **Recommended action:** In both actions, SELECT the position/department by id+tenant and assert legalEntityId === user.legalEntityId (or actor is a HIGH_PRIVILEGE/global role) before insert; reject if the row does not exist. Validate targetDepartmentId/targetPositionId existence + entity in transfer.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** No
- **Test coverage required before accept:** Tests: MANAGER raising a hiring request for a position in another legal entity is rejected; transfer with a non-existent or cross-entity target department/position is rejected.

##### `P1-M(transfer user.id)` · createTransferRequest inserts personId: personId ?? user.id for vacant positions — account id stored in persons FK column

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** MEDIUM
- **Area:** Departments / Positions / Org Chart
- **Evidence:** org-chart-actions.ts:279 personId = pos?.personId ?? null (occupiedByPersonId); line 294 `personId: personId ?? user.id, // fallback to actor`. transfer_requests.person_id is meant to be a persons.id, but user.id from getCurrentUser() is the auth/account id (used everywhere as actorId/createdBy/requestedById, e.g. lines 303/305). For a VACANT position pos.personId is null, so the fallback writes the actor's account id into the person_id slot. Transferring a vacant position is itself nonsensical, and the resulting row points person_id at a non-person id. Also note the COLLISION-004B unique index is on (tenant_id, person_id) WHERE PENDING — so two managers each raising a vacant-position transfer would both key on their own user.id, defeating the dedup intent for vacant cases.
- **Why QA/Playwright/manual missed it:** The UI only offers transfer/promotion on occupied employee nodes, so pos.personId is always populated in normal flows and the fallback branch is never hit by Playwright. It only triggers via a forged/edge call against a vacant position id. Typecheck passes because both are uuid strings.
- **Recommended action:** Reject the request when personId is null (vacant position cannot be transferred): `if (!personId) return { success:false, error:'No employee occupies this position.' }` instead of falling back to user.id.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** No
- **Test coverage required before accept:** Test: createTransferRequest against a vacant position (occupiedByPersonId null) returns an error and inserts no row.

##### `P3-A6` · getPersonEnrolments / getActiveEnrolment have no self/team IDOR check

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** MEDIUM
- **Area:** Insurance, Compliance, Reports, Directory, ESS
- **Evidence:** modules/insurance/actions.ts:595-628. getPersonEnrolments and getActiveEnrolment call requireRole(['HR_ADMIN','HR_DIRECTOR','SUPER_ADMIN','PAYROLL_ADMIN','EMPLOYEE','MANAGER']) then query medicalInsuranceEnrolments WHERE tenantId=TENANT_ID AND personId=<caller-supplied personId> with NO check that personId === session.user.personId (EMPLOYEE) or is a direct report (MANAGER). Both are 'use server' exports, so any authenticated EMPLOYEE can invoke getPersonEnrolments('<another-personId>') and read another employee's full enrolment rows (premiums, member IDs, plan, dependents). The ESS page app/(employee)/me/insurance/page.tsx:17,31 passes session.user.personId so the UI path is safe — but the action itself is not. Compare to modules/profile/actions.ts:24 which DOES enforce `role==='EMPLOYEE' && personId!==own -> null`.
- **Why QA/Playwright/manual missed it:** Playwright/manual tests always exercise the UI, which passes the caller's own personId (page.tsx line 17), so the response is always correct. Exploiting it requires a forged Server Action call with a different personId — not something typecheck, build, or page-level E2E ever does.
- **Recommended action:** Add an ownership/team gate inside both actions mirroring profile/actions.ts:24 — for EMPLOYEE require personId===user.personId; for MANAGER verify the target is in the manager's team (persons.lineManagerId===user.personId); admin roles unrestricted (optionally entity-scoped).
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** No
- **Test coverage required before accept:** Unit/integration test: EMPLOYEE calling getPersonEnrolments/getActiveEnrolment with a non-own personId returns empty/throws; MANAGER cross-team denied; own/team allowed.

##### `P3-A7` · enrol/cancel/extend/contractor-exception trust caller-supplied legalEntityId with no cross-entity guard

- **Classification:** PARTIALLY_REAL
- **Severity (verified):** MEDIUM
- **Area:** Insurance, Compliance, Reports, Directory, ESS
- **Evidence:** Plan CRUD enforces entity scope (actions.ts:74-77 getInsurancePlans, 190-192 update, 260-262 toggle) but enrolment actions do NOT: enrolEmployee (385-398) and enrolDependent (400-413) pass user.legalEntityId into the Tx (so the AUDIT actorEntityId uses the session entity), BUT the EnrolEmployeeSchema/EnrolDependentSchema include a caller-supplied legalEntityId (validations.ts:83-98) that enrolEmployeeTx/enrolDependentTx actually persist into the row (lifecycle.ts:246,475) and use for plan resolution (lifecycle.ts:194-200). enrolEmployee passes user.legalEntityId to the Tx actor but data.legalEntityId (from the parsed input) flows into enrolEmployeeTx via `data` — confirm: actions.ts:390 parses data then passes `data` to enrolEmployeeTx, and enrolEmployeeTx uses data.legalEntityId (lifecycle.ts:160,194,246) with NO equality check against user.legalEntityId for non-SUPER_ADMIN. grantContractorInsuranceException (actions.ts:529-588) and extendEnrolmentExpiry (483-523) likewise never compare data.legalEntityId / the enrolment's entity to user.legalEntityId. cancelEnrolment routes through cancelEnrolmentTx which looks up the enrolment by id only (lifecycle.ts:559-567) with no entity gate. So an HR_ADMIN of entity A could enrol/operate against entity B by supplying entity B's id.
- **Why QA/Playwright/manual missed it:** All UI forms pre-fill legalEntityId from the current entity context, so functional tests always send the matching entity. Cross-entity abuse needs a forged Server Action argument; typecheck/build/E2E never vary it. Audit still records actorEntityId=session entity, masking the mismatch in logs.
- **Recommended action:** In enrolEmployee/enrolDependent/extendEnrolmentExpiry/cancelEnrolment/grantContractorInsuranceException, for non-SUPER_ADMIN assert the target entity (data.legalEntityId or the looked-up enrolment.legalEntityId) === user.legalEntityId, throwing FORBIDDEN — the exact pattern already in plan CRUD (actions.ts:74-77,190-192).
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** Yes
- **Test coverage required before accept:** Integration: HR_ADMIN of entity A enrolling/cancelling/extending against entity B is rejected with FORBIDDEN; SUPER_ADMIN allowed.

##### `P3-H3` · Employee-level premium override unimplemented (no column, no field, no UI)

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** MEDIUM
- **Area:** Insurance, Compliance, Reports, Directory, ESS
- **Evidence:** Business rule confirmed: 'employee-level premium override'. drizzle/schema/transactions.ts:375-409 (medicalInsuranceEnrolments) has annualPremiumAed/employerPremiumAed/employeePremiumAed but NO override flag/column. EnrolEmployeeSchema (validations.ts:82-88) has no override field. enrolEmployeeTx always recomputes via splitPremium(plan.employeePremiumAed, plan.employerContributionPct) (lifecycle.ts:213-214) — there is no path to supply a per-employee premium. grep for premiumOverride/overrideAed in transactions.ts returns nothing (only an unrelated S9-03 delegation comment).
- **Why QA/Playwright/manual missed it:** It's a missing feature, not a runtime fault — nothing throws, typecheck/build pass, and no test asserts the override exists. QA validates implemented flows, not absent business rules.
- **Recommended action:** Business decision: confirm override is in Phase-1 scope. If yes, add nullable employeePremiumOverrideAed (+ overrideReason) column on medicalInsuranceEnrolments via migration 0055, an optional field in EnrolEmployeeSchema, and have enrolEmployeeTx prefer the override over splitPremium when present (still keeping employer+employee=annual fils invariant). If deferred, document as a known gap.
- **Schema change required:** Yes · **Data migration/backfill:** No · **Affects other modules:** No
- **Test coverage required before accept:** Once scoped: unit test that an explicit override is persisted verbatim and not overwritten by splitPremium; audit records the override + reason.

##### `P3-H4` · Auto-plan-change-on-promotion unwired — changePlanTx has zero callers

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** MEDIUM
- **Area:** Insurance, Compliance, Reports, Directory, ESS
- **Evidence:** Business rule: 'auto plan change on promotion'. changePlanTx is defined (modules/insurance/lifecycle.ts:693) and exported (modules/insurance/index.ts:30) but grep across the codebase (excluding tests) finds NO caller — only the definition, the barrel export, and a comment reference at lifecycle.ts:551. The promotion path modules/core-hr/employment-actions/actions.ts (promotion line 185 -> runGradeChange line 357) contains no insurance import or changePlanTx call; grep for insurance/Insurance/changePlan in that file returns nothing relevant. So promoting an employee to a grade with a different eligible plan does NOT change their insurance plan.
- **Why QA/Playwright/manual missed it:** Dead-but-correct code: changePlanTx itself is well-formed so typecheck/build pass, and unit tests may cover changePlanTx in isolation. No E2E exercises 'promote then verify plan changed' because the wiring was never built.
- **Recommended action:** Business decision + wiring: in runGradeChange (employment-actions/actions.ts) detect a grade-driven plan change and call changePlanTx within the same transaction (importing via modules/insurance barrel per Hard Rule 6). Make it best-effort/non-blocking like the termination cancellation loop.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** Yes
- **Test coverage required before accept:** Integration: promotion to a grade gated to a different plan triggers changePlanTx (old enrolment CANCELLED, new ACTIVE on target plan, dependents transferred); audit INSURANCE.PLAN_CHANGED emitted.

##### `P3-M-contractor-bypass` · Contractor exclusion bypassed when explicit planId is supplied to enrolEmployee

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** MEDIUM
- **Area:** Insurance, Compliance, Reports, Directory, ESS
- **Evidence:** BR-INS-007 contractor check lives ONLY in resolveEligiblePlan (eligibility.ts:40-46: returns null for CONTRACTOR without insuranceExceptionGranted). enrolEmployeeTx only calls resolveEligiblePlan in the else branch when data.planId is omitted (lifecycle.ts:176-209). When data.planId IS supplied (lifecycle.ts:165-175), the plan is fetched by id and used directly — the worker_assignments employmentType/insuranceExceptionGranted is never read, so a CONTRACTOR with no exception can be enrolled by calling enrolEmployee with an explicit planId. EnrolEmployeeSchema.planId is optional (validations.ts:85), so the UI/caller controls this.
- **Why QA/Playwright/manual missed it:** The exception flow (grantContractorInsuranceException) does check employmentType==='CONTRACTOR' (actions.ts:547), and HR UI for normal employees typically omits planId (auto-resolve), so functional tests pass. Bypass requires calling enrolEmployee with an explicit planId for a contractor — not a path the UI normally drives.
- **Recommended action:** Move the BR-INS-007 contractor guard into enrolEmployeeTx so it runs on BOTH branches: always fetch the current worker_assignment's employmentType + insuranceExceptionGranted and reject CONTRACTOR-without-exception regardless of whether planId was supplied.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** No
- **Test coverage required before accept:** Unit/integration: enrolEmployee({planId, contractor without exception}) throws BR-INS-007; with exception granted it succeeds.

##### `P3-M-dependent-double-enrol` · enrolDependentTx has no per-dependent existing-ACTIVE duplicate guard

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** MEDIUM
- **Area:** Insurance, Compliance, Reports, Directory, ESS
- **Evidence:** enrolEmployeeTx has a dup guard (lifecycle.ts:219-239: rejects if an ACTIVE/PENDING/RENEWAL_DUE EMPLOYEE enrolment exists). enrolDependentTx has NO equivalent: it only counts total DEPENDENT enrolments vs plan.maxDependents (lifecycle.ts:417-436). It never checks whether THIS specific dependentId already has an ACTIVE enrolment, so the same dependent can be inserted twice (two enrolment rows + two dependentCountInsured increments at lifecycle.ts:506-512) as long as the cap isn't reached, double-counting premiums and the insured count.
- **Why QA/Playwright/manual missed it:** UI flow normally enrols each dependent once; double-submit/replay needed to trigger. No test asserts idempotency per dependentId. Cap check passes so nothing errors.
- **Recommended action:** Add a guard at the start of enrolDependentTx: reject if an ACTIVE/PENDING enrolment already exists for (personId, dependentId, enrolmentType='DEPENDENT'), mirroring the employee-path dup check.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** No
- **Test coverage required before accept:** Integration: enrolling the same dependentId twice throws CONFLICT and does not double-increment dependentCountInsured.

##### `P2-M-DEWS-GPSSA-YTD` · DEWS/GPSSA contribution tables never written; computeYtd never called; YTD = current period only

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** MEDIUM
- **Area:** Payroll (WPS/EOSB/GPSSA/DEWS)
- **Evidence:** actions.ts imports calculateDewsContribution and computeYtd (lines 60-61) but grep shows they are never CALLED outside their own definitions/tests (only definitions at calculation-engine.ts:258,274 and test references). gpssaContributions and dewsContributions are imported in actions.ts (lines 38-39) and queries.ts (22-23) but grep for insert(gpssaContributions/dewsContributions) returns 0 matches — no row is ever inserted, so getGpssaTotalForRun/getDewsTotalForRun (queries.ts:586-606) always return 0. In calculatePayrollRun the YTD columns are set to the CURRENT period values, not accumulated: ytdGrossPay=String(calc.totalGrossPay), ytdNetPay=String(calc.netPay), ytdEosbProvision=String(calc.eosbProvision), ytdGpssa=String(calc.gpssaEmployeeDeduct) (actions.ts:401-404) — prior YTD is never read or added (computeYtd unused), so YTD on payslips equals only the latest run.
- **Why QA/Playwright/manual missed it:** computeYtd and calculateDewsContribution have direct unit tests (payroll-engine.test.ts) so they appear 'covered', masking that nothing wires them into the run. DEWS only applies to DIFC entities (likely none in dev data), so empty dews_contributions looks normal. A single-run dev dataset makes YTD==period indistinguishable from correct YTD. Unused imports are not TS errors.
- **Recommended action:** Inside calculatePayrollRun: (1) for DIFC entities compute and insert dewsContributions; (2) insert gpssaContributions for UAE nationals; (3) load prior-period YTD and call computeYtd to accumulate before persisting ytd* columns. Add integration coverage.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** No
- **Test coverage required before accept:** Integration test: run two consecutive periods → assert ytd* = sum of both, and assert gpssa_contributions (UAE national) and dews_contributions (DIFC) rows are created with expected amounts.

##### `P2-M-EOSB-UNPAID` · EOSB ignores unpaid leave — totalUnpaidLeaveDays hardcoded 0; engine never passes it

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** MEDIUM
- **Area:** Payroll (WPS/EOSB/GPSSA/DEWS)
- **Evidence:** services.ts calculateEosb supports input.totalUnpaidLeaveDays (lines 172, 227) and subtracts it from service days (netDays = calendarDays - unpaidDays, line 264). But calculation-engine.ts:99-104 builds EosbInput with NO totalUnpaidLeaveDays (defaults to 0), and triggerEosbCalculation (actions.ts:1075-1080) calls calculateEosb without it, then hardcodes totalUnpaidLeaveDays:0 into the eosb_calculations row (actions.ts:1100). Result: unpaid leave never reduces service for gratuity, slightly over-stating EOSB/provision for employees with unpaid leave history.
- **Why QA/Playwright/manual missed it:** Engine unit tests pass an explicit totalUnpaidLeaveDays and verify the deduction works in isolation — but no test verifies the caller actually supplies it. The omission is a missing data flow, invisible to typecheck (param is optional) and to page tests.
- **Recommended action:** Aggregate unpaid leave days for the person (from absence/timesheets) and pass totalUnpaidLeaveDays into calculateEosb in both calculation-engine.calculateEmployeePayroll and triggerEosbCalculation; persist the real value into eosb_calculations.total_unpaid_leave_days.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** Yes
- **Test coverage required before accept:** Unit/integration test: employee with N unpaid leave days → assert EOSB/provision reflects reduced net service vs zero-unpaid baseline.

##### `P2-M-MEDICAL` · medicalInsuranceDeduct hardcoded /12 (no payFrequency awareness); medicalInsuranceEr is a dead 0?0:0 ternary

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** MEDIUM
- **Area:** Payroll (WPS/EOSB/GPSSA/DEWS)
- **Evidence:** actions.ts:349 medicalInsuranceDeduct: Number(emp.employeePremiumAed ?? 0)/12 — divides the annual premium by 12 regardless of payFrequency (definition supports MONTHLY/BIWEEKLY/WEEKLY/OFF_CYCLE per validations.ts:14), so non-monthly runs deduct the wrong amount. calculation-engine.ts:117 medicalInsuranceEr = r2(input.medicalInsuranceDeduct > 0 ? 0 : 0) — both ternary branches are 0, so employer medical cost is ALWAYS 0 and is excluded from totalEmployerCost (line 122-124), even though employerPremiumAed is fetched (actions.ts:291) and the schema/payslip have a medical_insurance_er field (foundation.ts:1277, queries.ts:305).
- **Why QA/Playwright/manual missed it:** Dev data is monthly so /12 produces a plausible number; the dead ternary always returns 0 which silently passes any 'er cost is a number' assertion. No test checks employer medical cost > 0 or non-monthly frequency. The 0?0:0 ternary compiles cleanly (no TS warning).
- **Recommended action:** Divide premium by the run's periods-per-year derived from payFrequency, not a hardcoded 12. Replace the dead medicalInsuranceEr ternary with Number(employerPremiumAed)/periodsPerYear and include it in totalEmployerCost.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** No
- **Test coverage required before accept:** Unit test: BIWEEKLY/WEEKLY frequency → correct per-period medical deduction; employer premium>0 → medicalInsuranceEr>0 and rolled into totalEmployerCost.

##### `P2-M-PRORATION` · No mid-period proration for hires/terminations — full basic salary always paid

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** MEDIUM
- **Area:** Payroll (WPS/EOSB/GPSSA/DEWS)
- **Evidence:** calculation-engine.ts calculateEmployeePayroll applies basicSalary * payMultiplier (line 58) where payMultiplier comes only from suspension treatment (services.ts determineSuspensionPayTreatment). There is no factor for partial-month employment. calculatePayrollRun (actions.ts:283-356) selects active employees with no comparison of hireDate or termination date to the pay period and passes full basicSalary (line 338). An employee hired or terminated mid-period is paid (or accrues) a full month's basic + allowances.
- **Why QA/Playwright/manual missed it:** Engine tests feed a full-month basic and assert gross math; no fixture sets hireDate or termination inside the pay period. The UI cannot reveal it without such an employee. Typecheck unaffected.
- **Recommended action:** Compute a proration factor = worked-days-in-period / period-days using hireDate / termination date (and assignment effective dates), apply to basic + recurring allowances. Confirm exact UAE proration convention (calendar vs 30-day) with finance.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** Yes
- **Test coverage required before accept:** Integration/unit test: employee with hireDate mid-period and another terminated mid-period → assert prorated gross.

##### `P2-P5` · No duplicate / overlapping pay-period guard in createPayrollRun

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** MEDIUM
- **Area:** Payroll (WPS/EOSB/GPSSA/DEWS)
- **Evidence:** modules/payroll/validations.ts createPayrollRunSchema (lines 26-42) has only two .refine() checks: payPeriodEnd>=payPeriodStart and paymentDate>=payPeriodStart — pure date ordering. createPayrollRun (actions.ts:183-256) verifies the payroll definition exists (lines 192-202) then inserts a new payrollRuns row with no SELECT to detect an existing run for the same payrollId/legalEntity covering the same or overlapping pay_period_start/pay_period_end. Nothing prevents two REGULAR runs for the same month → employees paid twice if both progress to SIF/CONFIRMED.
- **Why QA/Playwright/manual missed it:** Date-ordering Zod validation passes in all UI/page tests because the form always submits a single well-formed period. No test attempts to create a second run for an already-covered period. The duplicate only causes harm downstream (double WPS payment), which no test simulates.
- **Recommended action:** Before insert, SELECT existing non-cancelled runs for (tenant, payrollId/legalEntityId, runType=REGULAR) where periods overlap; throw a bilingual 'period already has a run' error. Optionally add a DB exclusion/partial-unique constraint on (payroll_id, pay_period_start, pay_period_end) for REGULAR runs.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** No
- **Test coverage required before accept:** Integration test: create a REGULAR run for a period, then attempt an overlapping period → expect rejection.

##### `P1-H2` · getPerson(id) unguarded in edit page can crash Server Component render (BUG-NAV-001 class)

- **Classification:** PARTIALLY_REAL
- **Severity (verified):** MEDIUM
- **Area:** Persons / Employee Master
- **Evidence:** app/(hr-admin)/persons/[id]/edit/page.tsx:57 `const person = await getPerson(id)` has NO try/catch, unlike app/(hr-admin)/persons/[id]/page.tsx:60-66 which wraps getPerson in try/catch → notFound() citing BUG-NAV-001. getPerson (modules/core-hr/actions.ts:427) ends in `translateError(e,'getPerson')`, and lib/app-error.ts:580 `translateError(): never` always throws (line 577 comment 'NEVER returns — always throws'). So any throw inside getPerson crashes the render boundary. HOWEVER the edit page pre-guards the two normal throw paths: role gate at lines 39-40 (redirect) and a cross-entity / not-found pre-flight at lines 46-55 (`db.select` scope + notFound() + redirect) BEFORE calling getPerson. getPerson's own cross-entity throw (actions.ts:383) is therefore already excluded, and its best-effort read-audit is itself try/caught (actions.ts:406-421). The only remaining live crash path is a transient DB error during getPerson's main SELECT (actions.ts:356-360) — real but narrower than the profile-page bug, which had no pre-flight.
- **Why QA/Playwright/manual missed it:** Playwright/manual edit-page tests always hit a valid in-scope person with a healthy DB, so getPerson returns normally and the page renders. The crash only occurs on a transient Neon error during getPerson's SELECT — not reproducible in green-path E2E and invisible to typecheck/build (the call is type-valid).
- **Recommended action:** Wrap getPerson(id) at edit/page.tsx:57 in try/catch → console.error + notFound(), mirroring the profile page lines 60-66, for defense-in-depth parity. Low effort, no behavior change on the happy path.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** No
- **Test coverage required before accept:** Server-component test: mock getPerson to throw; assert edit page calls notFound() rather than propagating. Or a fault-injection integration test that forces a DB error during getPerson.

##### `P1-H4` · No uniqueness on emirates_id / passport_number / employee_code; random-IV encryption defeats any DB unique index; no app-level dedup

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** MEDIUM
- **Area:** Persons / Employee Master
- **Evidence:** lib/encryption.ts:47 `const iv = randomBytes(IV_BYTES)` — every encrypt() of the same plaintext yields different ciphertext (IV is prepended, line 51), so a DB UNIQUE index on the ciphertext column can never detect duplicates. Schema columns have no .unique(): drizzle/schema/foundation.ts:186 `emiratesId: varchar('emirates_id',{length:500})`, :190 `passportNumber: varchar('passport_number',{length:500})`, :228 `employeeCode: varchar('employee_code',{length:50})` — none chained .unique() (contrast :157 personNumber .unique(), :70 entityCode .unique()). No app-level dedup: createPerson (actions.ts:150-226) and updatePerson (actions.ts:658-833) never SELECT-by-EID/passport/employeeCode to reject an existing duplicate. So two persons can hold the same Emirates ID, passport, or employee code.
- **Why QA/Playwright/manual missed it:** Typecheck/build/Playwright never assert uniqueness; happy-path hire tests use distinct PII. Duplicate-PII is a data-integrity concern only surfaced by deliberately hiring two people with the same Emirates ID — not part of functional E2E. The random-IV property makes a naive 'add a unique index' fix appear to work in a quick test (it compiles and the column has no index) while silently doing nothing.
- **Recommended action:** NEEDS_BUSINESS_DECISION on whether EID/passport must be globally unique per tenant (legitimate edge cases: re-issued passport, data-entry of historical record). If yes, store a separate keyed-hash column (e.g. HMAC-SHA256(EID) with a server-side key) and put the UNIQUE index on that hash, plus an app-level pre-insert SELECT on the hash inside createPerson/updatePerson transactions. employee_code uniqueness is a simpler per-tenant partial unique index since it is not encrypted.
- **Schema change required:** Yes · **Data migration/backfill:** Yes · **Affects other modules:** Yes
- **Test coverage required before accept:** Integration tests: createPerson twice with same EID → second rejected; same passport → rejected; same employeeCode → rejected; verify HMAC hash column populated and index enforced; backfill migration produces no collisions on existing data (must dry-run against real data set).

##### `P1-L(position)` · updatePerson never copies currentPositionId/Department/Grade/Location into payload — position edits via updatePerson silently no-op; dead positionChanged var

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** MEDIUM
- **Area:** Persons / Employee Master
- **Evidence:** In updatePerson (modules/core-hr/actions.ts:678-753) there is NO assignment of data.currentPositionId, data.currentDepartmentId, data.currentGradeId, or data.currentLocationId into updatePayload (the payload block copies identity, PII, insurance, lineManagerId, assignmentStatus, workerCategory, etc. but omits all four current* pointers). Consequently line 801 `if ('currentPositionId' in updatePayload)` is ALWAYS false (the key is never set), so the occupied_by_person_id sync at 803-814 is unreachable, and line 799 `const positionChanged = ...` is dead (computed, never read). PersonEditForm DOES send these fields in the patch: buildPatch sets patch.currentPositionId/Department/Grade/Location at PersonEditForm.tsx:365-368 — and UpdatePersonSchema accepts them (validations.ts:208-211). So an HR admin who changes position/department/grade/location on the edit form gets a 'saved' success but the persons row pointers are unchanged. Broader than the finding stated: 4 fields, not just position.
- **Why QA/Playwright/manual missed it:** The patch is type-valid and updatePerson returns { id, changedFields } success, so the UI shows success and Playwright assertions on the toast pass. The diff-based audit changedFields also won't list these (payload never changed), so nothing flags it. Detecting the no-op requires re-reading the persons row after save and asserting the new pointer — not done in E2E. Note employment-pointer edits were also historically routed through employment_actions (page.tsx:22-25 comment says employment fields are NOT editable here), so the partial UI exposure may be unintended.
- **Recommended action:** Either (a) add `if (data.currentPositionId !== undefined) updatePayload.currentPositionId = data.currentPositionId` (and the other three) so the existing occupancy-sync block at 801-814 fires, OR (b) if employment pointers must only flow through effective-dated employment_actions (Hard Rule 3), remove these fields from PersonEditForm's patch so the form does not falsely report success. Also delete the dead positionChanged var at 799. Decide which is intended before patching.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** No
- **Test coverage required before accept:** Integration test: call updatePerson with a new currentPositionId and assert persons.currentPositionId actually changed AND positions.occupied_by_person_id was synced; same for department/grade/location.

##### `P1-L(status)` · Edit form offers assignmentStatus 'INACTIVE' not in enum; UpdatePersonSchema widens to z.string()

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** MEDIUM
- **Area:** Persons / Employee Master
- **Evidence:** PersonEditForm.tsx:973 renders `<SelectItem value="INACTIVE">Inactive</SelectItem>`. The Zod AssignmentStatus enum (validations.ts:44-47) is ['ACTIVE','ON_LEAVE','SUSPENDED','TERMINATED','RETIRED','DECEASED','PENDING_HIRE','PENDING_APPROVAL'] — no INACTIVE. But UpdatePersonSchema widens the field: validations.ts:207 `assignmentStatus: z.string().optional()` — so 'INACTIVE' passes validation and reaches the UPDATE at actions.ts:741. The DB CHECK constraint persons_assignment_status_check (drizzle/migrations/0003_qa_audit_check_constraints.sql:33-35) allows only ('ACTIVE','ON_LEAVE','SUSPENDED','TERMINATED','RETIRED','DECEASED','PENDING_HIRE') — INACTIVE is NOT permitted for persons (it is only valid for worker_assignments, migration 0003:55-56). So selecting Inactive → DB error 23514, surfaced to the user via translateError. Additionally note PENDING_APPROVAL is in the Zod enum but also absent from the persons CHECK — a separate latent mismatch.
- **Why QA/Playwright/manual missed it:** z.string() makes the field type-valid (no typecheck error). E2E edit tests typically set ACTIVE/ON_LEAVE/SUSPENDED which all satisfy the CHECK, so the green path passes. Choosing 'Inactive' specifically is an uncommon manual action; when QA did hit it, the failure is a runtime DB constraint violation (23514) not a build/test failure, so it would only appear in ad-hoc manual testing of that exact option.
- **Recommended action:** Remove the 'INACTIVE' SelectItem from PersonEditForm.tsx:973 (persons use ON_LEAVE/SUSPENDED/TERMINATED, not INACTIVE), and tighten UpdatePersonSchema.assignmentStatus from z.string() to the AssignmentStatus enum so invalid values are rejected with a clean message before the DB. Also reconcile PENDING_APPROVAL: either add it to the persons CHECK (migration 0055) or drop it from the enum for persons.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** No
- **Test coverage required before accept:** Unit test: UpdatePersonSchema rejects assignmentStatus='INACTIVE' and 'PENDING_APPROVAL' once tightened. UI test: Inactive option no longer offered. Integration: updatePerson with each allowed status succeeds against the CHECK.

##### `P2-L(delegate raw text)` · Delegate target is raw 'Person ID or email' free text; engine accepts only person id; typo orphans step

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** MEDIUM
- **Area:** Timesheets + Workflow approval engine
- **Evidence:** action-form.tsx:101-113 <input placeholder='Person ID or email'> → submit('DELEGATE') passes delegateTo.trim() as delegateToPersonId (36). lib/workflow-engine.ts takeWorkflowAction DELEGATE (992-1024) sets assignedToPersonId=delegateToPersonId with NO lookup/validation — an email or typo'd UUID is written verbatim as the assignee. The step's assignedToPersonId then matches no real session person, so no one is authorised (962-971) and no notification recipient resolves → the step is orphaned/stuck until SLA. DelegationDrawer.tsx similarly takes raw 'Person ID' text (107-128) but createDelegationRule at least inserts a FK-backed row; the inline approval-form delegate has no such backing.
- **Why QA/Playwright/manual missed it:** Testers paste a valid person UUID; an email/typo is never submitted. No FK on workflow_step_instances.assignedToPersonId catches it at insert (the column is set via UPDATE without validation), so no DB error surfaces.
- **Recommended action:** Replace the free-text field with a PersonSelect LOV (id-only), and in takeWorkflowAction validate delegateToPersonId resolves to an active person before reassigning; reject email/invalid values with a clear error.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** Yes
- **Test coverage required before accept:** Integration: DELEGATE with email/invalid id → rejected; with valid id → reassigned + notified.

##### `P2-M(attendance dup)` · createManualAttendance/processExcelUpload plain INSERT, no unique (person,date[,source]); only DEVICE delete-then-insert

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** MEDIUM
- **Area:** Timesheets + Workflow approval engine
- **Evidence:** modules/timesheets/actions.ts createManualAttendance:393 and processExcelUpload:928 do plain tx.insert(attendanceRecords) with no pre-check and no upsert. Only processBiometricSync (770-779) delete-then-inserts WHERE source='DEVICE'. drizzle/schema/timesheets.ts attendanceRecords has no unique index on (person_id, attendance_date) or (person_id, attendance_date, source) — confirmed no constraint in schema. Re-running an Excel upload or re-entering a manual day creates duplicate rows; buildSummary (196-210) then double-counts workedHours/OT.
- **Why QA/Playwright/manual missed it:** Each test uploads/enters a given day once; duplicate creation needs a second submission of the same person+date, which the happy-path doesn't do. No DB error because nothing forbids the duplicate.
- **Recommended action:** Add a partial/unique index on (tenant_id, person_id, attendance_date, source) and use onConflictDoUpdate (or pre-flight existence check) in createManualAttendance and processExcelUpload, mirroring the DEVICE upsert.
- **Schema change required:** Yes · **Data migration/backfill:** No · **Affects other modules:** No
- **Test coverage required before accept:** Integration: re-upload same Excel row / re-enter same manual day → single row updated, summary not doubled.

##### `P2-M(delegate self/cycle)` · createDelegationRule rejects only direct reciprocal; no self-delegation, no multi-hop cycle; DELEGATE action no delegate validation

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** MEDIUM
- **Area:** Timesheets + Workflow approval engine
- **Evidence:** modules/workflow/actions.ts createDelegationRule (1318-1404): the only guard (1334-1362) queries for an existing ACTIVE rule where delegatorId=delegateId AND delegateId=delegatorId (direct A->B / B->A reciprocal). There is NO check for delegatorId===delegateId (self-delegation) and NO transitive cycle check (A->B, B->C, C->A passes). lib/workflow-engine.ts takeWorkflowAction DELEGATE branch (992-1024) only checks `!delegateToPersonId`; it never verifies the delegate exists, is active, belongs to the entity, or differs from the actor — it blindly sets assignedToPersonId=delegateToPersonId. resolveDelegate in workflow-hierarchy.ts also follows only one hop.
- **Why QA/Playwright/manual missed it:** Tests create simple A->B delegations; self and 3-node cycles aren't part of fixtures. The DELEGATE action in UI is hard to reach (see P2-L) so delegate-target validation is rarely exercised; an invalid UUID just orphans the step silently.
- **Recommended action:** In createDelegationRule reject delegatorId===delegateId and run a transitive-cycle walk over ACTIVE rules. In takeWorkflowAction DELEGATE, validate delegateToPersonId is an existing active person, !==actorPersonId, same tenant/entity before reassigning.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** Yes
- **Test coverage required before accept:** Unit/integration: self-delegation blocked; A->B->C->A blocked; DELEGATE to nonexistent/inactive/self → error not orphaned step.

##### `P2-M(getPersonSchedule null)` · Null schedule defaults contractedHours=8; deriveStatus always isWeekend:false,isHoliday:false → weekend/holiday punches scored normal with overtime

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** MEDIUM
- **Area:** Timesheets + Workflow approval engine
- **Evidence:** modules/timesheets/actions.ts getPersonSchedule (130-149) returns null when no current assignment/workScheduleId. All 4 calc callers fall back to contractedHours=8: createManualAttendance:369-371, reviewExceptionRequest:580-582, processBiometricSync:748-750, processExcelUpload:905-907. deriveStatus is ALWAYS called with isWeekend:false,isHoliday:false (createManualAttendance:388-389, processBiometricSync:766-767, processExcelUpload:923-924) — there is no weekend/holiday computation anywhere in the file. A Friday/Saturday or public-holiday punch is therefore scored PRESENT/LATE and any hours beyond 8 become overtime (calcOvertime), instead of WEEKEND/PUBLIC_HOLIDAY (deriveStatus:119-120 can return those but is never fed true).
- **Why QA/Playwright/manual missed it:** Tests use weekday dates with a configured schedule, so the 8h default and weekend/holiday branches are never exercised. status string is valid either way so no type/DB error. Payroll impact (spurious OT) only shows with weekend data + null schedule.
- **Recommended action:** Compute isWeekend from the schedule's working days and isHoliday from public_holidays for the attendanceDate and pass into deriveStatus; when schedule is null, either reject or flag the record rather than silently assuming 8h Sun-Sat.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** Yes
- **Test coverage required before accept:** Unit: punch on a non-working day → status WEEKEND/PUBLIC_HOLIDAY, overtime 0; null schedule → no silent 8h normal-day scoring.

##### `P2-T1` · No timesheet hours bounds; overtime numeric(4,2) overflow; reversed times silently 0; validations.ts empty

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** MEDIUM
- **Area:** Timesheets + Workflow approval engine
- **Evidence:** modules/timesheets/validations.ts is literally `export {}` (skeleton, no schemas). modules/timesheets/actions.ts:86-89 calcWorkedHours = Math.max(0,(out-in)/3.6e6) — only clamps at 0, no upper bound; line 105-107 calcOvertime = Math.max(0, worked-contracted) — no cap. drizzle/schema/timesheets.ts:61 overtimeHours numeric(precision:4,scale:2) → DB max 99.99; worked_hours is numeric(5,2) max 999.99. A manual/excel entry with timeIn far before timeOut (e.g. wrong date, or ISO timeIn on day N-1 vs timeOut day N) yields workedHours>>contracted → overtimeHours.toFixed(2) > 99.99 → Postgres numeric overflow 22003 inside the insert tx (actions.ts:409,797,945). Reversed timeIn/timeOut → Math.max(0,...) → workedHours 0, status PRESENT with 0 hours (silently wrong, not an error). No Zod parse of params anywhere in actions.ts.
- **Why QA/Playwright/manual missed it:** UI never submits multi-day spans or reversed times for a single calendar day, so Playwright/manual happy-path always stays under 99.99h and in-order. Typecheck/build pass because numeric() accepts any string and overflow is a runtime DB error. The empty validations.ts compiles fine.
- **Recommended action:** Add a Zod schema in validations.ts: require timeOut>timeIn, cap workedHours (e.g. <=24h/day reject otherwise), validate attendanceDate; clamp/validate overtimeHours <=99.99 before insert and reject reversed punches with a user error instead of silent 0.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** No
- **Test coverage required before accept:** Unit tests: reversed times → explicit error not 0; >99.99h overtime → rejected before insert (no 22003); multi-day span rejected; empty validations replaced and exercised.

##### `P2-T2` · Workflow can activate with zero steps or unresolvable CUSTOM_GROUP step (no group); no server validation

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** MEDIUM
- **Area:** Timesheets + Workflow approval engine
- **Evidence:** app/(hr-admin)/configuration/workflows/[workflowId]/StepEditorDrawer.tsx:162 only validates `stepNameEn` required; line 173 sets hierarchyGroupId = CUSTOM_GROUP ? (customGroupId || null) : null — a CUSTOM_GROUP step with blank group saves hierarchyGroupId=null. modules/workflow/actions.ts createWorkflowStep (703-766) and updateWorkflowStep (771-823) insert/update with NO check that CUSTOM_GROUP has hierarchyGroupId. toggleWorkflowActive (627-676) flips isActive with NO check that the definition has >=1 step or that steps are resolvable. lib/workflow-hierarchy.ts resolveStepApprover CUSTOM_GROUP branch (429-439): if !hierarchyGroupId and !hierarchyPersonId returns [] (silently); resolveApprovalChain:495 `if(!approvers.length) continue` silently drops the step. submitWorkflow:516 returns error only if the WHOLE chain is empty, so a 1-step workflow whose only step is an unresolvable CUSTOM_GROUP fails at submit time for the employee, and a 0-step active workflow returns 'No approvers'.
- **Why QA/Playwright/manual missed it:** Admins in tests always pick a real group/level, so the chain resolves. The failure only surfaces at an employee's submit time (different actor, different page) — not in the workflow-builder Playwright flow. Build/typecheck pass because null is a valid column value.
- **Recommended action:** In createWorkflowStep/updateWorkflowStep require hierarchyGroupId when hierarchyType==='CUSTOM_GROUP' (and hierarchyLevel for LINE_MANAGER/POSITION); in toggleWorkflowActive(true) refuse to activate a definition with 0 active steps or any step that cannot resolve an approver (run previewWorkflow as a dry check).
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** Yes
- **Test coverage required before accept:** Integration: activate 0-step def → blocked; save CUSTOM_GROUP step without group → blocked; submitWorkflow against such a def → friendly error, no partial instance.

##### `P2-T4` · LINE_MANAGER/POSITION resolvers select isActive but never filter; terminated manager can be approver

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** MEDIUM
- **Area:** Timesheets + Workflow approval engine
- **Evidence:** lib/workflow-hierarchy.ts loadPerson (50-98) selects persons.isActive but resolveLineManagerApprover (158-259) and resolvePositionApprover (267-353) never check person.isActive before returning {personId,personName} — a terminated/inactive manager still occupying the chain is assigned the step. Only CUSTOM_GROUP path filters: resolveGroupMembers:384 `eq(persons.isActive,true)`. The ASSIGN_HR_ADMIN branch (332-348) does filter isActive=true, but the primary LINE_MANAGER/POSITION returns do not.
- **Why QA/Playwright/manual missed it:** Seed managers are all active; terminations in E2E don't re-route an in-flight or new workflow, so an inactive approver is never produced in tests. isActive is selected (so it compiles and looks handled) but unused.
- **Recommended action:** In resolveLineManagerApprover/resolvePositionApprover, when the resolved person is !isActive, continue up the chain (or apply onApproverNotFound policy) instead of returning the inactive person.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** Yes
- **Test coverage required before accept:** Integration: line manager isActive=false → resolver skips to next active manager; position occupied by inactive person → escalates per policy.

##### `P1-H8a` · work_schedules.scheduleCode has no unique index and createWorkSchedule has no assertCodeUnique

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** MEDIUM
- **Area:** Worker Assignments / Work Schedules / MDM
- **Evidence:** drizzle/schema/configuration.ts:160 scheduleCode varchar(30).notNull() — NO .unique() (compare drizzle/schema/foundation.ts:380 jobCode .notNull().unique(), :70 entityCode .unique()). grep of drizzle/migrations/*.sql shows the only schedule_code reference is 0000_outgoing_tusk.sql:301 'schedule_code varchar(30) NOT NULL' with no UNIQUE/CREATE UNIQUE INDEX anywhere. app/(hr-admin)/master-data/work-schedules/components/WorkScheduleActions.ts createWorkSchedule (lines 112-190) and updateWorkSchedule (192-285) never call any assertCodeUnique helper. Contrast BusinessUnitActions.ts:37 assertCodeUnique + calls at :72/:119.
- **Why QA/Playwright/manual missed it:** Duplicate codes are a data-integrity issue only surfaced by inserting two schedules with the same code in the same entity — not exercised by typecheck/build or single-record Playwright flows. UI does not validate uniqueness client-side.
- **Recommended action:** Add an assertCodeUnique(legalEntityId, scheduleCode, excludeId?) helper called in both create and update (matching BusinessUnitActions), and add a DB partial/composite unique index on (tenant_id, legal_entity_id, schedule_code) via a new migration 0055 to enforce at the DB layer.
- **Schema change required:** Yes · **Data migration/backfill:** No · **Affects other modules:** No
- **Test coverage required before accept:** Integration: creating two work schedules with the same code in the same entity must be rejected; same code across different entities allowed.

##### `P1-H8b` · No guard for a single isDefault work schedule per entity; fallback resolvers assume exactly one

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** MEDIUM
- **Area:** Worker Assignments / Work Schedules / MDM
- **Evidence:** drizzle/schema/configuration.ts:187 isDefault boolean.notNull().default(false) — no partial unique index. WorkScheduleActions.ts createWorkSchedule:156 and updateWorkSchedule:246 set isDefault: input.isDefault directly and NEVER clear any prior default row for the same entity. No migration creates a partial unique index on isDefault (grep is_default+schedule returns nothing). Fallback consumers assume exactly one: modules/profile/actions.ts:455-467 selects isDefault=true with .limit(1) (silently picks an arbitrary row if two exist), and schedule-default.ts resolveDefaultScheduleId (per CLAUDE.md) resolves entity default. Two isDefault=true rows -> nondeterministic default.
- **Why QA/Playwright/manual missed it:** Seed data has exactly one default per entity, so .limit(1) always returns the intended row. The defect needs two isDefault rows for the same entity, which no test fixture or UI flow creates. Build/typecheck unaffected.
- **Recommended action:** On create/update when isDefault=true, within the transaction first UPDATE work_schedules SET is_default=false WHERE legal_entity_id=… AND id<>self; add a partial unique index CREATE UNIQUE INDEX … ON work_schedules (tenant_id, legal_entity_id) WHERE is_default=true (handling NULL entity separately).
- **Schema change required:** Yes · **Data migration/backfill:** No · **Affects other modules:** Yes
- **Test coverage required before accept:** Integration: setting a second schedule default must clear the prior default (single-default invariant); profile/timesheet default resolution deterministic.

##### `P1-H9` · assignWorkSchedule worker_assignments sync silently no-ops when person has no current worker_assignment, causing timesheets vs ESS drift

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** MEDIUM
- **Area:** Worker Assignments / Work Schedules / MDM
- **Evidence:** modules/core-hr/work-schedule-assignment-actions.ts:113-122 updates workerAssignments SET workScheduleId WHERE tenantId AND personId AND isCurrent=true. If the person has NO current worker_assignment row (the documented legacy/seed case — see modules/profile/actions.ts:309-320 'some active employees have NO worker_assignments row'), this UPDATE affects 0 rows with no error, while a new isCurrent work_schedule_assignments row IS inserted (lines 76-92). getPersonSchedule (modules/timesheets/actions.ts:130-148) reads ONLY workerAssignments.workScheduleId and returns null when no current assignment -> timesheets see no/old schedule while ESS profile (which reads work_schedule_assignments, profile/actions.ts:403-415) shows the new schedule. Real drift.
- **Why QA/Playwright/manual missed it:** Affects only employees lacking a current worker_assignments row (legacy/seed-without-assignment). Standard new-hire flow (createPerson) always creates a worker_assignment, so UI/Playwright tests on freshly created persons never hit the 0-row path. No assertion on UPDATE rowCount.
- **Recommended action:** Capture the UPDATE result rowCount; if 0, either (a) surface a warning/error that the person has no current worker_assignment, or (b) backfill/create the worker_assignment, so the two tracking systems cannot diverge. Document that work_schedule_assignments is authoritative and getPersonSchedule should fall back to it.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** Yes
- **Test coverage required before accept:** Integration: assignWorkSchedule for a person with no current worker_assignment must not silently succeed; assert getPersonSchedule and getMyProfile agree afterward.

##### `P1-M(WS MDM tx)` · WorkScheduleActions create/update do bare db.insert/update + writeAuditLog outside a transaction (Rule 1)

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** MEDIUM
- **Area:** Worker Assignments / Work Schedules / MDM
- **Evidence:** app/(hr-admin)/master-data/work-schedules/components/WorkScheduleActions.ts: createWorkSchedule does db.insert (lines 129-161) then a SEPARATE writeAuditLog (163-174) — no db.transaction. updateWorkSchedule does db.update (220-251) then separate writeAuditLog (256-270). disableWorkSchedule (305-328) and enableWorkSchedule (352-374) same pattern. Violates ADR-001 Rule 1 'Every DB write = Drizzle transaction + audit.log() in same transaction'. Contrast BusinessUnitActions.ts:137-164 (db.transaction wrapping update + writeAuditLog(tx)) and GradeActions.ts db.transaction at :113/:209/:303/:388/:453. NOTE: the modules/core-hr/work-schedule-assignment-actions.ts functions (assignWorkSchedule, correctWorkScheduleAssignment) DO use db.transaction correctly — only the MDM master-data CRUD is non-compliant.
- **Why QA/Playwright/manual missed it:** Functionally works in the happy path: both writes normally succeed, so UI/Playwright see correct results. The gap only manifests if the audit insert fails after the data write commits (orphaned write with no audit) — not reproducible in normal QA. Typecheck/build pass since writeAuditLog accepts an optional tx.
- **Recommended action:** Wrap each of create/update/disable/enable in db.transaction and pass tx to writeAuditLog (matching BusinessUnit/Grade), so the master-data write and its audit row commit or roll back together.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** No
- **Test coverage required before accept:** Source-inspection test asserting WorkScheduleActions writes occur inside db.transaction with audit in same tx (consistency guard like collision tests).

##### `P1-M(multi-isCurrent)` · No partial unique index / advisory lock guarding single isCurrent work_schedule_assignment; concurrent calls can create two current rows

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** MEDIUM
- **Area:** Worker Assignments / Work Schedules / MDM
- **Evidence:** drizzle/schema/foundation.ts:978-996 work_schedule_assignments has NO uniqueIndex (grep of foundation.ts shows none referencing this table); no migration adds a partial unique index on (tenant_id, person_id) WHERE is_current. work-schedule-assignment-actions.ts:48-123 assignWorkSchedule opens a db.transaction but acquires NO pg_advisory_xact_lock (contrast createLeaveRequest's pg_advisory_xact_lock(hashtext('leave:'||personId)) per CLAUDE.md P6D, and payroll lock). The close-existing read at lines 50-60 uses .limit(1). Two concurrent assignWorkSchedule calls for the same person can both read 'one existing current', both close it, both insert a new isCurrent=true row -> two current rows. profile/actions.ts:403-415 and getPersonSchedule both .limit(1) -> nondeterministic which current row wins.
- **Why QA/Playwright/manual missed it:** Requires two concurrent requests for the same person within the read-modify-write window. Default Postgres READ COMMITTED does not serialize these. Single-threaded Playwright/manual tests and typecheck/build never produce concurrency. No DB-level invariant to catch it.
- **Recommended action:** Add pg_advisory_xact_lock(hashtext('work_schedule:'||personId)) as the first statement inside the transaction (mirroring ARIA-LOCK P6D), AND add a partial unique index CREATE UNIQUE INDEX … ON work_schedule_assignments (tenant_id, person_id) WHERE is_current=true as defense-in-depth.
- **Schema change required:** Yes · **Data migration/backfill:** No · **Affects other modules:** Yes
- **Test coverage required before accept:** Source-inspection + integration: advisory lock present and per-person; partial unique index rejects a second isCurrent row.

#### — LOW —

##### `P3-L-ARIA-STREAM` · ARIA chat route try/catch covers only stream creation; mid-stream errors only logged via detached .catch → truncated stream

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** LOW
- **Area:** ARIA, Notification outbox, Employee Letters
- **Evidence:** app/api/aria/chat/route.ts:66-104: client.messages.stream(...) is created and immediately returned as a ReadableStream (line 98). The try/catch (lines 53-120) wraps only stream creation; once the Response is returned, an error arising DURING token streaming surfaces only in the detached void stream.finalMessage().then(...).catch(()=>{/* stream error logged below */}) (lines 74-96) — but the .catch is empty and there is no 'below' handler in the returned-stream path. The client receives a truncated SSE stream with no error frame. This route is a separate raw-passthrough endpoint and does NOT use sendAriaMessage's graceful AriaResponse handling.
- **Why QA/Playwright/manual missed it:** Happy-path streaming completes fine in tests; mid-stream provider failures (rate-limit/timeout after first byte) are hard to simulate in E2E and don't throw synchronously, so the route returns 200 and tests pass.
- **Recommended action:** Wrap the readable stream so a mid-stream error emits a terminal SSE error event (and logs it) before closing, or pipe through a transform that catches and surfaces the failure to the client. Replace the empty .catch with real error logging.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** No
- **Test coverage required before accept:** Test that a stream that errors after first chunk emits an error frame the client can detect, not a silent truncation.

##### `P3-L-BRIEFING-NOGATE` · generateDailyBriefing has no role gate (only ARIA_API_KEY check)

- **Classification:** PARTIALLY_REAL
- **Severity (verified):** LOW
- **Area:** ARIA, Notification outbox, Employee Letters
- **Evidence:** modules/aria/actions.ts:230-261: generateDailyBriefing is 'use server' (file line 1) and only checks process.env.ARIA_API_KEY (line 234-235); it does NOT call auth()/requireRole. It accepts kpis + ctx as arguments (the caller computes KPIs), so it does not itself read the DB — it only sends caller-supplied numbers to Claude and returns prose. Its sole caller is the admin panel components/aria/AriaOSHome.tsx:130. Impact is low because it leaks no data on its own (KPIs are passed in by the already-gated caller); the gap is that any authenticated user could invoke it to consume the ARIA API quota with arbitrary KPI text. No PII disclosure path.
- **Why QA/Playwright/manual missed it:** Only invoked from the admin ARIA OS home, which is route-gated; non-admin invocation of the bare Server Action is never tested. No data is read so no obvious leak in functional tests.
- **Recommended action:** Add await getCurrentUser() + requireRole(MANAGER/ADMIN set) at the top of generateDailyBriefing to prevent quota abuse and align with the rest of the module; do not rely on the caller's gate.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** No
- **Test coverage required before accept:** Unit: EMPLOYEE invoking generateDailyBriefing is rejected.

##### `P3-L-LETTER-BILINGUAL` · ESS letters page status labels and the signing page are English-only (legally significant for AR users)

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** LOW
- **Area:** ARIA, Notification outbox, Employee Letters
- **Evidence:** app/(employee)/me/letters/page.tsx:14-35: STATUS_META labels ('Submitted','Pending Approval','Ready'...) and STATUS_DESC are English string literals with no Arabic variant or locale switch (the page selects STATUS_META[l.status] at line 230 regardless of locale). app/letters/sign/[token]/SigningPageClient.tsx is entirely English ('Acknowledge & Sign','I confirm that I have read...', line 86-141) and page.tsx:21-37 ('Already Signed','Link Expired') is English-only — a legally significant acknowledgement screen with no Arabic. This violates project Rule 4 (every user-facing string must be EN and AR).
- **Why QA/Playwright/manual missed it:** Visual/E2E tests run in the default English locale and assert English text, so missing Arabic is invisible. The RTL certification suite focused on layout/fonts, not on these specific letter/signing strings. Not a functional/type defect.
- **Recommended action:** Add Arabic variants for STATUS_META/STATUS_DESC and switch by locale; bilingualize SigningPageClient and the signing page status screens (and ideally render the AR letter body when language='ar'/'both').
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** No
- **Test coverage required before accept:** RTL/i18n test asserting Arabic labels render on /me/letters and the signing page under locale=ar.

##### `P3-M-LETTERNUM-RACE` · nextLetterNumber = SELECT COUNT(*)+1 with no advisory lock

- **Classification:** PARTIALLY_REAL
- **Severity (verified):** LOW
- **Area:** ARIA, Notification outbox, Employee Letters
- **Evidence:** modules/employee-letters/queries.ts:242-254: nextLetterNumber computes COUNT(*) of matching letters and returns prefix+(count+1). No pg_advisory_xact_lock and the count is read OUTSIDE the insert transaction (actions.ts:94/777 compute it before db.transaction at 122/802). Two concurrent generations CAN compute the same number. BUT drizzle/schema/employee-letters.ts:92 declares letter_number varchar(50).notNull().unique() — a duplicate INSERT fails with Postgres 23505. So the race cannot corrupt data; it surfaces as a failed transaction: in bulkGenerateLetters the per-person try/catch records {error} (actions.ts:157-159); in requestLetter the outer catch returns SYSTEM_ERROR (actions.ts:845-847). Net effect: a rare spurious failure on concurrent generation, not duplicate numbers.
- **Why QA/Playwright/manual missed it:** Serialized test/dev generation never collides; the unique constraint would only trip under true concurrency. Build/typecheck unaffected.
- **Recommended action:** Move nextLetterNumber inside the insert transaction and acquire pg_advisory_xact_lock(hashtext('letter:'||typeCode)) before the COUNT (same pattern as payroll nextRunNumber), OR derive the number from a sequence/upsert counter, so concurrent requests serialize cleanly instead of one failing.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** No
- **Test coverage required before accept:** Concurrency test: two simultaneous requestLetter calls for the same typeCode both succeed with distinct sequential numbers.

##### `P3-M-OUTBOX-DUP` · pollOutbox selects-then-dispatches with no FOR UPDATE SKIP LOCKED / claim / overlap guard

- **Classification:** PARTIALLY_REAL
- **Severity (verified):** LOW
- **Area:** ARIA, Notification outbox, Employee Letters
- **Evidence:** lib/jobs/process-driver.ts:76-132: pollOutbox does db.select WHERE processedAt IS NULL (lines 76-80), dispatches each row (lines 97-99), then UPDATE ... processedAt=now (lines 118-132). No row claim, no SELECT...FOR UPDATE SKIP LOCKED, no transaction wrapping select+dispatch. HOWEVER the driver is a single in-process node-cron with a module-level `started` singleton (lines 149-165), so within one process ticks do not run concurrently by default (cron fires every 10s, line 162; a slow tick that overruns 10s COULD overlap since pollOutbox is async and cron does not await it). Real double-dispatch only occurs across multiple server instances or a long-running tick overlap. Current dispatchEvent only handles ARIA.LEAVE_RECOMMENDATION (lines 46-52); a duplicate would re-run generateLeaveRecommendation (idempotency of that function not verified here). Note this node-cron driver does not run on Vercel serverless at all.
- **Why QA/Playwright/manual missed it:** Single-instance dev/test never overlaps within 10s and never runs two driver processes; the comment block (lines 14,55-67) asserts idempotency, so it reads as safe. Requires concurrent processes or an artificially slow tick to reproduce.
- **Recommended action:** Claim rows atomically: UPDATE events SET claimed_at=now WHERE id IN (SELECT id FROM events WHERE processed_at IS NULL ORDER BY ... LIMIT 50 FOR UPDATE SKIP LOCKED) RETURNING ...; dispatch only claimed rows; or guard the tick with an in-process running flag to prevent overlap. Confirm generateLeaveRecommendation is idempotent.
- **Schema change required:** Yes · **Data migration/backfill:** No · **Affects other modules:** No
- **Test coverage required before accept:** Concurrency test: two simultaneous pollOutbox invocations over the same unprocessed row dispatch the handler exactly once.

##### `P2-L-ESS-bilingual` · ESS me/leave page STATUS_CONFIG is English-only while admin table is bilingual

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** LOW
- **Area:** Absence / Leave
- **Evidence:** app/(employee)/me/leave/page.tsx:12-20 STATUS_CONFIG maps each status to a single English `label` (e.g. 'Approved','Pending','Rejected','Cancelled','Draft','Taken','Recalled') with no Arabic variant and no locale switch — the render uses cfg.label directly (line 223). By contrast the admin table LeaveTableClient.tsx:30-42 defines `{en, ar}` labels and switches `locale === 'ar' ? .ar : .en`. So an Arabic-locale ESS user sees English status chips, violating Hard Rule 4 (bilingual mandatory). The page header text ('My Leave','Pending: N days', etc.) is likewise English-only.
- **Why QA/Playwright/manual missed it:** Typecheck/build pass (valid strings). RTL/Arabic cert focused on admin and layout surfaces; ESS leave status chips were not asserted in Arabic. English renders fine in default-locale Playwright runs.
- **Recommended action:** Mirror the admin pattern: give STATUS_CONFIG {en, ar} labels and switch on the user/cookie locale (avaniis_locale), or reuse a shared status-label helper so ESS and admin stay in sync. Localise the surrounding ESS leave strings as well.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** No
- **Test coverage required before accept:** RTL/locale test asserting ESS leave status chips render Arabic labels when locale=ar.

##### `P2-L-RECALLED` · RECALLED status enumerated and labelled but no action produces it

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** LOW
- **Area:** Absence / Leave
- **Evidence:** RECALLED appears in the validation enum (modules/absence/validations.ts:28), the DB CHECK constraint (0006_sprint5_check_and_unique.sql:18), and is given display styling/labels in admin (LeaveTableClient.tsx:27,36), filter (LeaveFilterBar.tsx:58), reports (reports/page.tsx:992) and ESS (me/leave/page.tsx:19). Grep for any code that SETS absence_entries.status to 'RECALLED' returns ZERO writes — the only non-display references are the enum/constraint definitions. lib/workflow-engine.ts has no recall path for absence_entries (grep RECALLED/recall = none). So RECALLED is an unreachable status for leave requests; the label/filter is dead UI.
- **Why QA/Playwright/manual missed it:** Dead-but-valid enum value: typecheck/build pass, and no test attempts to produce it, so its unreachability is invisible. It is cosmetic and causes no runtime error.
- **Recommended action:** Either implement a recall action (workflow recall → set absence_entries.status='RECALLED' with balance release + audit) if the business wants it, or remove RECALLED from the leave status enum/labels/filters to avoid implying a capability that does not exist. No urgency.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** No
- **Test coverage required before accept:** If implemented: integration test for recall transition + balance release. If removed: assertion that leave status set excludes RECALLED.

##### `P2-L4` · ESS My Leave page uses its own raw query; total omits carriedForward/adjusted while available uses closingBalance, producing available > total

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** LOW
- **Area:** Absence / Leave
- **Evidence:** app/(employee)/me/leave/page.tsx:30-69 issues its own db.select directly (does NOT call getLeaveHistoryForEmployee). Line 138 `available = parseFloat(closingBalanceDays)` (closingBalanceDays = opening+accrued+carried+adjusted−taken−pending−forfeited per services.ts:59-67), but line 139 `total = accruedDays + openingBalanceDays` only — it omits carriedForwardDays AND adjustedDays (neither is even selected in the query, lines 33-41). When carriedForward>0 or a positive adjustment exists, available (which includes them) exceeds total, so the progress bar ratio (line 142 `Math.min(available/total,1)`) is clamped and the '{available} / {total} days available' label (line 150) shows available>total — visibly inconsistent. The query also bypasses the shared getLeaveHistoryForEmployee enrichment.
- **Why QA/Playwright/manual missed it:** Pure display arithmetic on a self-service page; typecheck/build pass. Tests likely use fixtures with carriedForward=0 and adjusted=0, where total==available holds and the inconsistency never appears. No assertion compares available<=total across carry-forward fixtures.
- **Recommended action:** Compute total consistently — either total = opening+accrued+carriedForward+adjusted (matching the closing-balance inputs) by selecting and including carriedForwardDays and adjustedDays, or route the page through getLeaveHistoryForEmployee so ESS and admin share one balance derivation.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** No
- **Test coverage required before accept:** Component/unit: fixture with carriedForwardDays>0 asserts available<=total and correct label; parity test vs admin balances derivation.

##### `P2-M-decide-double-tx` · decideLeaveRequest mirror-tx may double-write status/balance after engine already updated

- **Classification:** PARTIALLY_REAL
- **Severity (verified):** LOW
- **Area:** Absence / Leave
- **Evidence:** takeWorkflowAction→dispatchResourceCompletion already updates absence_entries.status for the 'absence_entries' resource type (lib/workflow-engine.ts:756-781 sets status=finalStatus). decideLeaveRequest THEN opens its own mirror transaction (actions.ts:1144-1215) and updates absence_entries.status again (1146-1158) plus the balance ledger (1160-1199). The status IS double-written, but idempotently — both write the same finalStatus, so no corruption. Critically, the engine does NOT write absenceBalances anywhere (verified: lib/workflow-engine.ts has no absenceBalances import/reference; only absenceEntries/absenceTypes), so the balance ledger (pending→taken at 1176-1198) is written exactly ONCE by the mirror-tx. Therefore the 'double-write balance' part of the claim is a FALSE concern; only the status update is duplicated and it is harmless/idempotent. Risk surface: the two writes are in separate transactions, so an engine-status-update commit followed by a mirror-tx failure is handled by emitCompensationEvent (1216-1218) — a known reconciliation path, not silent corruption.
- **Why QA/Playwright/manual missed it:** Idempotent same-value status writes produce no observable defect, so tests pass. The split-transaction reconciliation path requires an injected mid-flight failure to exercise.
- **Recommended action:** No balance double-write fix needed. Optional cleanup: drop the redundant status update from decideLeaveRequest's mirror-tx (engine already set it) and keep only the approval-metadata + balance ledger + audit, reducing one redundant UPDATE. Consider threading the engine action and the mirror-tx into one transaction to eliminate the compensation-event path.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** Yes
- **Test coverage required before accept:** Integration asserting engine does NOT touch absenceBalances and the ledger transition pending→taken happens exactly once; a fault-injection test for the compensation path.

##### `P2-M-resubmit` · submitLeaveRequest accepts REJECTED for re-submit but never re-checks balance/overlap (those live only in createLeaveRequest)

- **Classification:** PARTIALLY_REAL
- **Severity (verified):** LOW
- **Area:** Absence / Leave
- **Evidence:** submitLeaveRequest (actions.ts:521-523) allows `row.status !== 'DRAFT' && row.status !== 'REJECTED'` to pass, i.e. a REJECTED request can be re-submitted. The function performs cert-gate (554-571) and workflow init (598-701) but contains NO overlap check and NO balance gate — those exist only in createLeaveRequest (overlap actions.ts:324-350; balance gate 352-408). So a leave whose dates were valid at create time but now overlap a newly-APPROVED request, or whose balance is now insufficient, can be re-submitted unchecked. Severity reduced to LOW because: (a) given P2-L1, no balance is reserved at submit anyway, so the balance angle is subsumed by P2-L1; (b) overlap re-check gap requires a REJECTED request to later collide with a separately-approved one — a narrow window; (c) decideLeaveRequest still re-derives final state via the workflow engine. The mechanism is real but the practical exposure is narrow.
- **Why QA/Playwright/manual missed it:** The DRAFT→PENDING happy path (the common case) is tested; the REJECTED→PENDING re-submit branch with a subsequently-conflicting approved request is an uncommon sequence not covered by fixtures. UI re-submit always reuses original dates, so overlap/balance drift is rarely triggered.
- **Recommended action:** On REJECTED→PENDING re-submit, re-run the overlap check (and, after P2-L1 is fixed, the balance gate) inside the submit transaction, or force re-validation by routing re-submit through createLeaveRequest's validation. At minimum re-check overlap against DRAFT/PENDING/APPROVED/TAKEN.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** No
- **Test coverage required before accept:** Integration: REJECTED request whose dates now overlap an APPROVED request is blocked on re-submit; normal re-submit still succeeds.

##### `P3-L(document-bilingual)` · getDocumentUrl and /api/documents/[id] error messages are English-only (violates bilingual mandate)

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** LOW
- **Area:** Auth/RBAC, DataOps console, Documents/Storage
- **Evidence:** modules/core-hr/documents/actions.ts getDocumentUrl returns English-only strings: :411 'Document not found.', :422/:433/:449 'You do not have permission...', :453 'No file attached...', :475-476 file-missing messages — none carry name_ar/Arabic. app/api/documents/[id]/route.ts htmlError pages are `<html lang="en">` (:84) and all errorResponse details (:118-135,:188-216,:296-329) are English only. Violates ADR-001 rule 4 (every user-facing string must be EN AND AR), unlike e.g. the leave backdate errors which return EN · AR.
- **Why QA/Playwright/manual missed it:** Error paths (not found / unauthorized / file missing) are negative cases rarely traversed in happy-path Playwright runs; RTL/Arabic certification focused on layout and primary UI strings, not API/Server-Action error bodies. English text renders fine in tests so nothing fails.
- **Recommended action:** Return bilingual EN · AR strings (or i18n keys resolved by locale) from getDocumentUrl and the API route error responses, matching the established EN · AR pattern used in lib/app-error.ts backdate handlers; localize the htmlError page by request locale.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** No
- **Test coverage required before accept:** Test that document access error responses contain Arabic text (' · ' separator) or resolve to the requester's locale.

##### `P3-M(idle-timeout)` · lib/auth.ts implements only 30-min absolute maxAge; 15-min idle timeout (S3-10/SEC-04) is not implemented

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** LOW
- **Area:** Auth/RBAC, DataOps console, Documents/Storage
- **Evidence:** lib/auth.ts:191 `session: { strategy: 'jwt', maxAge: 1800 }` — 30-minute ABSOLUTE timeout only. Comment at :187-190 explicitly states: 'S3-10 / SEC-04: 15-min idle enforcement for HR_ADMIN+ is a Phase 3 stretch goal ... idle-timeout middleware (client-side heartbeat + server-side revocation) is deferred.' No sliding/idle expiry, heartbeat, or last-activity check exists anywhere. JWT maxAge is absolute, not idle-based.
- **Why QA/Playwright/manual missed it:** Sessions do expire at 30 min so the app behaves correctly in tests; the distinction between absolute-30-min vs idle-15-min is a policy/NFR nuance not exercised by functional Playwright tests. It is openly documented as deferred, so it is a known gap rather than a regression.
- **Recommended action:** Confirm with security whether 30-min absolute satisfies the S3-10/SEC-04 requirement. If 15-min idle is required, implement a sliding expiry (updateAge / last-activity timestamp in JWT + server check) for HIGH_PRIVILEGE_ROLES; otherwise update the NFR/governance docs to record absolute-30-min as the accepted control.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** No
- **Test coverage required before accept:** If implemented: test that a HIGH_PRIVILEGE session with >15-min inactivity is rejected while an active one is renewed; absolute 30-min cap still enforced.

##### `storage-local-in-prod` · Factory allows explicit DOCUMENT_STORAGE_PROVIDER=local in production (only warns); production throw fires only when provider unset AND no DATABASE_URL

- **Classification:** PARTIALLY_REAL
- **Severity (verified):** LOW
- **Area:** Auth/RBAC, DataOps console, Documents/Storage
- **Evidence:** lib/storage/factory.ts:253-271: the production throw ('Document storage is not configured') only fires when `!rawProviderEnv && isProduction` (provider UNSET) — and getActiveProvider():66 first returns 'postgres' if DATABASE_URL is present, so the throw needs provider unset AND no DATABASE_URL. Explicit `DOCUMENT_STORAGE_PROVIDER=local` in production is permitted: buildLocalProvider(isProduction):313-323 only console.warn, returns LocalStorageProvider. HOWEVER the data-loss is mitigated at the serving layer: getStorageMode():156 defaults to 'durable' in production, _isDurableProviderConfigured():196-197 returns false for local, so getStorageUIState():210 returns 'not-configured' → /api/documents/[id]/route.ts:118-127 returns 503 STORAGE_MISCONFIGURED and uploads are blocked. The hole only opens if DOCUMENT_STORAGE_MODE=uat-temporary is ALSO set in production, in which case ephemeral /tmp is used and files are silently lost on container recycle. Also note isVercelDeployed()+DATABASE_URL auto-upgrades explicit local to postgres (:62).
- **Why QA/Playwright/manual missed it:** Requires a specific prod misconfiguration (explicit local + uat-temporary mode) to lose data; the default-durable mode blocks ops with a clear 503, which would surface in any real deployment test. Unit tests cover the unset-prod throw and the provider resolution, not the explicit-local + uat-temporary combination.
- **Recommended action:** Make buildLocalProvider throw (not warn) when NODE_ENV==='production' AND not an explicitly whitelisted QA flag; or require DOCUMENT_STORAGE_MODE!=='uat-temporary' to be rejected in production so /tmp can never serve real user files. Document that explicit local in prod is QA-only.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** No
- **Test coverage required before accept:** Test: NODE_ENV=production + DOCUMENT_STORAGE_PROVIDER=local + DOCUMENT_STORAGE_MODE=uat-temporary either throws at factory or is blocked at the serving layer; verify the auto-upgrade-to-postgres path on Vercel.

##### `P1-H1` · departments.work_schedule_id is an orphaned column — no schedule-resolution consumer

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** LOW
- **Area:** Departments / Positions / Org Chart
- **Evidence:** modules/timesheets/actions.ts:130-145 getPersonSchedule() reads ONLY workerAssignments.workScheduleId (line 132 select({workScheduleId: workerAssignments.workScheduleId}); line 145 .where(eq(workSchedules.id, assignment.workScheduleId))). Grep across lib/ modules/ app/ shows departments.workScheduleId is ONLY written/read for CRUD display: app/(hr-admin)/master-data/departments/page.tsx:36/49/123 (list display join) and DepartmentActions.ts create/update/correct persistence. ZERO resolution consumers. Migration 0054 comment (lines 3-6) claims an inheritance tier 'employee override > DEPARTMENT > ... > system default' that no code implements. CLAUDE.md itself states 'work_schedule_id is a dormant foundation column'.
- **Why QA/Playwright/manual missed it:** Pure dead-data: the column persists and round-trips through the department drawer, so all UI/page Playwright tests and typecheck pass. There is no runtime path that reads it for scheduling, so no test would ever observe a wrong schedule — the feature simply does nothing.
- **Recommended action:** Either (a) wire departments.workScheduleId into getPersonSchedule() as a fallback when worker_assignments.workScheduleId is null (employee override > department > entity default), or (b) downgrade migration 0054's comment to reflect that this is currently a dormant/reserved column with no resolution behaviour. No data loss either way.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** Yes
- **Test coverage required before accept:** Add a getPersonSchedule resolution test: person with null worker_assignments.workScheduleId but a department.workScheduleId set must resolve to the department schedule (only if option (a) is chosen).

##### `P1-L(org-chart EN)` · EmployeeNode/VacantNode render deptNameEn only; deptNameAr fetched but never displayed

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** LOW
- **Area:** Departments / Positions / Org Chart
- **Evidence:** build-tree.ts populates data.deptNameAr (line 302, and 600 in getDirectReportNodes) from d.name_ar. But components/org-chart/EmployeeNode.tsx:144 renders {data.deptNameEn} and VacantNode.tsx:130 renders {data.deptNameEn} only — grep finds no deptNameAr usage in either node component. Under Arabic/RTL locale the department label stays English. Violates CLAUDE.md Rule 4 (every user-facing string bilingual) for this label.
- **Why QA/Playwright/manual missed it:** RTL certification (45/45) covered audited surfaces but the org-chart node department sub-label was not in that set; the English label renders correctly so functional/visual tests pass without asserting Arabic department text specifically.
- **Recommended action:** In EmployeeNode/VacantNode, select deptNameAr vs deptNameEn based on the active locale (the data is already available). Same for position title sub-labels if affected.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** No
- **Test coverage required before accept:** RTL test asserting the org-chart node shows deptNameAr when locale=ar.

##### `P1-M(FK SQL-only)` · work_schedule_id FK exists only in manual migration 0054 DO-block, not Drizzle .references()

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** LOW
- **Area:** Departments / Positions / Org Chart
- **Evidence:** drizzle/schema/foundation.ts:342 `workScheduleId: uuid('work_schedule_id')` — a bare uuid with NO .references() (contrast headPersonId at 318/337 which use .references(() => persons.id)). The FK is created only by migration 0054 lines 23-35 (a DO-block guarded ADD CONSTRAINT) which is a MANUAL migration: the file header (lines 16-18) and CLAUDE.md confirm drizzle journal stops at 0039 and `pnpm drizzle-kit migrate` will NOT apply 0054. So on any fresh DB built from the journal, the column exists with no FK. CLAUDE.md's own 2026-06-01 note says 0054 was verified applied to Neon (column+index+FK present), so prod/staging are fine — the risk is fresh-environment drift, not current prod.
- **Why QA/Playwright/manual missed it:** drizzle-kit generate/migrate and typecheck operate on the Drizzle schema (which has no FK declared), so they never flag the missing reference; Neon already had 0054 applied manually so runtime is consistent there. A fresh local/CI DB seeded via the journal would silently lack the FK — not caught by app tests.
- **Recommended action:** The decision to keep .references() off (avoiding a foundation->configuration circular import) is documented and intentional; ensure the deployment checklist requires manual application of 0054 on every new environment, or fold 0040-0054 into the drizzle journal. No app-code change needed; this is an environment-provisioning risk.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** No
- **Test coverage required before accept:** CI guard: after building a DB from migrations, assert the departments_work_schedule_id_work_schedules_id_fk constraint exists.

##### `P1-M(getDepartmentHead)` · getDepartmentHead join does not filter persons.isActive/assignmentStatus (tenantId IS filtered)

- **Classification:** PARTIALLY_REAL
- **Severity (verified):** LOW
- **Area:** Departments / Positions / Org Chart
- **Evidence:** modules/core-hr/department-head.ts:33-42 innerJoin persons ON persons.id = departments.headPersonId, WHERE and(eq(departments.tenantId, TENANT_ID), eq(departments.id, departmentId)). It DOES filter departments.tenantId (line 41) — the finding's claim of 'no tenantId filter' is FALSE for the department side; persons is joined by id so it is implicitly the same tenant. However the finding is correct that there is NO persons.isActive / persons.assignmentStatus filter — a terminated head is still returned. The function is read-only and explicitly documented (lines 4-15) as a future-workflow data-availability helper with NO routing wired, so impact today is nil.
- **Why QA/Playwright/manual missed it:** The function has zero production consumers (no workflow routes to DEPARTMENT_HEAD yet), so no test exercises the active-state path; it returns data correctly for the happy case (active head) which is all current tests would check.
- **Recommended action:** When DEPARTMENT_HEAD approver routing is actually implemented, add isActive=true AND assignmentStatus='ACTIVE' filters (or return a status flag) so a terminated head is not silently selected as an approver. No change needed while the helper is unconsumed. The tenantId portion of the finding is a false claim.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** Yes
- **Test coverage required before accept:** Test getDepartmentHead returns null/flag when the head is terminated (assignmentStatus!=ACTIVE) — only once a consumer exists.

##### `P1-M(head revalidate)` · assertHeadPersonValid only runs when headPersonId changed — terminated head re-persisted unvalidated on edit

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** LOW
- **Area:** Departments / Positions / Org Chart
- **Evidence:** DepartmentActions.ts updateDepartment line 264: `if (input.headPersonId && input.headPersonId !== before.headPersonId)` — validation is skipped when the head is unchanged. Same pattern in correctDepartment line 415. The update SET at line 288 re-persists headPersonId regardless. assertHeadPersonValid (lines 109-132) gates on isActive AND assignmentStatus==='ACTIVE'; CLAUDE.md confirms persons.isActive is NOT cleared on termination (only assignmentStatus is). So a department whose head was terminated after assignment keeps an invalid head through any unrelated edit.
- **Why QA/Playwright/manual missed it:** Requires a temporal sequence: assign valid head, terminate that person, then edit the department for an unrelated field. No single test session reproduces this; the 'changed-only' guard is intentional to keep legacy NULL-head departments editable, so the side effect is silent.
- **Recommended action:** Business decision on strictness: either re-validate the existing head on every edit (blocks editing departments with a since-terminated head — may be too strict per the legacy-edit policy), or add a non-blocking warning. Given the documented legacy-edit allowance, treat as low severity.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** No
- **Test coverage required before accept:** Test: edit a department whose stored head is now isActive=true but assignmentStatus!=ACTIVE, unchanged head — confirm chosen behaviour (skip vs re-validate).

##### `P1-M(org-tree cycle)` · WITH RECURSIVE org_tree relies only on depth<10 clamp, no cycle/visited guard

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** LOW
- **Area:** Departments / Positions / Org Chart
- **Evidence:** lib/org-chart/build-tree.ts:134 depth=Math.min(maxDepth,10); recursive member line 238 `WHERE ot.depth < ${depth}` is the ONLY termination guard — there is no visited-set / cycle-detection in the CTE. If positions.reports_to_position_id ever forms a cycle, the CTE would re-emit nodes until the depth clamp stops it (default 6, max 10), producing duplicated/incorrect nodes rather than a hang. Position cycles are independently prevented by detectCircularChain in PositionActions.ts:142-161 (update/correct), so a cycle should not exist via the app — but createPosition skips that check (P1-H6) and direct DB edits are unguarded.
- **Why QA/Playwright/manual missed it:** Healthy seed data has no position cycle, so the CTE always terminates correctly and renders fine. A cycle would need to be introduced out-of-band (direct SQL / the createPosition gap), which test data never does.
- **Recommended action:** Defense-in-depth: the depth clamp already prevents infinite recursion, so this is acceptable as-is; optionally add a path/visited array (UNION with NOT (p.id = ANY(path))) to drop cycle nodes cleanly. Primary fix belongs at write-time (P1-H6 / detectCircularChain on create).
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** No
- **Test coverage required before accept:** Integration test with a deliberately seeded position cycle: getOrgTree returns within the depth clamp without hanging and without duplicating beyond clamp.

##### `COMPLIANCE-ENGINE` · No runtime '57 BR-xx rule evaluation engine' in modules/compliance — only a rule editor

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** LOW
- **Area:** Insurance, Compliance, Reports, Directory, ESS
- **Evidence:** modules/compliance/ contains: actions.ts (only updateComplianceRule — a SUPER_ADMIN-gated editor of the compliance_rules catalogue, lines 57-127), schema.ts (re-exports complianceRules/medicalInsuranceEnrolments), index.ts (barrel), and services.ts/types.ts/validations.ts which are empty Sprint-2 skeletons (`export {}` only — services.ts:6 lines, types.ts:6 lines, validations.ts:6 lines). There is NO function that loads the 57 rules and evaluates them at runtime. The BR-xx rules are enforced ad hoc inline in their owning modules (e.g. BR-INS-001..007 in modules/insurance/eligibility.ts + lifecycle.ts; BR-INS-006 in core-hr/contracts/actions.ts). So 'a centralized compliance engine exists' is false; what exists is a rule catalogue + editor + scattered inline enforcement.
- **Why QA/Playwright/manual missed it:** Documentation (CLAUDE.md, '57 BR-xx rules') implies an engine; QA validated the inline enforcements (which pass) and the rule editor, so tests are green without a central engine ever existing.
- **Recommended action:** Reconcile docs vs reality: either (a) state explicitly that BR-xx enforcement is decentralised/inline and the compliance module is a catalogue+editor, or (b) if a central evaluation engine is required, scope it as new work (the skeleton files are placeholders). No defect in current behaviour — this is an architecture/expectation gap.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** Yes
- **Test coverage required before accept:** If an engine is built: rule-coverage test mapping each of the 57 catalogue rules to an enforcement point. Otherwise none.

##### `P3-L-insurance-bilingual` · ESS insurance status badge renders only English label; HR insurance report English-only

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** LOW
- **Area:** Insurance, Compliance, Reports, Directory, ESS
- **Evidence:** app/(employee)/me/insurance/MyInsuranceClient.tsx:30-37 STATUS_CONFIG defines both label and labelAr, but StatusBadge renders only {cfg.label} (line 58) — labelAr is never used. CATEGORY_LABEL (39-46) is English-only too. app/(hr-admin)/reports/insurance/page.tsx (376 lines) contains zero Arabic markers (grep for Ar/arabic/dir=/rtl/nameAr returns nothing) — section bodies are English-only. Violates the bilingual rule for user-facing strings (CLAUDE.md Rule 4), though severity is low since the page headers elsewhere carry Arabic.
- **Why QA/Playwright/manual missed it:** Visual/E2E tests run in English locale and assert English text; missing Arabic in a badge/internal report does not fail any assertion or typecheck.
- **Recommended action:** Render labelAr alongside/under label in StatusBadge (locale-aware), and add Arabic equivalents to the reports/insurance section bodies. Low priority; ESS badge is the more user-facing of the two.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** No
- **Test coverage required before accept:** Component test asserting Arabic label present when locale=ar; RTL snapshot of MyInsuranceClient.

##### `P3-M-backdate-grace-hardcoded` · effectiveDate backdate grace hardcoded to 30 days, ignoring configurable grace settings

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** LOW
- **Area:** Insurance, Compliance, Reports, Directory, ESS
- **Evidence:** validations.ts:4-9 — effectiveDateField uses isWithinBackdateGrace(d, 30) with a literal 30. The policy settings table DOES expose enrolmentGraceDays and dependentAddGraceDays (schema transactions.ts:433-435; validations UpsertPolicySettingsSchema:73-74 default 30) but the Zod field cannot read per-entity policy (validation runs before any DB/entity context). EnrolEmployeeSchema/EnrolDependentSchema both use this hardcoded field (validations.ts:86,95). So an entity configuring a 60-day grace still has enrolment backdating capped at 30.
- **Why QA/Playwright/manual missed it:** Default grace is 30 (UpsertPolicySettingsSchema:73-74), so the hardcoded value matches the default — tests using default settings never diverge. Only an entity that changed the grace would notice.
- **Recommended action:** Move the backdate-grace check out of the static Zod schema into enrolEmployeeTx/enrolDependentTx where policy settings are already loaded (getPolicySettingsTx), using policy.enrolmentGraceDays / policy.dependentAddGraceDays. Keep a generous static upper bound in Zod only as a sanity ceiling.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** No
- **Test coverage required before accept:** Unit: with enrolmentGraceDays=60, an effectiveDate 45 days back is accepted; with =15, 20 days back is rejected.

##### `P3-M-profile-audit-bug` · Profile recent-activity OR clause matches entityId against personId (semantic mismatch)

- **Classification:** PARTIALLY_REAL
- **Severity (verified):** LOW
- **Area:** Insurance, Compliance, Reports, Directory, ESS
- **Evidence:** modules/profile/actions.ts:258-264 — recent-activity query filters or(eq(auditLog.resourceId, personId), eq(auditLog.entityId, personId)). audit_log.entityId (foundation.ts:1362) is a generic 'entity touched' column; across the codebase it is overwhelmingly populated with legalEntityId (e.g. lifecycle.ts:285, core-hr/actions.ts:319,416,788). So the entityId clause is mostly inert (personId never equals a legalEntityId). It is NOT pure copy-paste though: updateMyProfile itself writes entityId=personId (profile/actions.ts:894), so the OR clause IS the mechanism that surfaces the employee's own profile-edit events. Net effect: harmless for correctness today (no cross-person leak because personId!=legalEntityId), but semantically fragile — any future event that stores a personId in entityId for a DIFFERENT person would leak into this person's feed.
- **Why QA/Playwright/manual missed it:** Activity feed visually shows plausible rows (resourceId match dominates), so it looks correct. The entityId branch rarely matches anything, so no wrong rows appear in test data; a leak would need a future event misusing entityId.
- **Recommended action:** Either drop the entityId clause (rely on resourceId, plus an explicit actorId/own-profile filter) or, if profile-edit events must appear, match on a dedicated condition (e.g. resourceType='persons' AND resourceId=personId). Avoid conflating entityId with personId.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** No
- **Test coverage required before accept:** Unit: feed contains only events where resourceId=personId (or an explicit profile-edit predicate); no row whose entityId is a legalEntityId leaks in.

##### `P2-L-CURRENCY` · Engine and SIF hardcode AED even though payroll definition currency can differ

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** LOW
- **Area:** Payroll (WPS/EOSB/GPSSA/DEWS)
- **Evidence:** payrollDefinitionSchema allows any 3-letter currency (validations.ts:16 currency default 'AED' but free). generateWpsSif writes wps_sif_records.currency: 'AED' hardcoded (actions.ts:763). The run-detail page formats with DEFAULT_CURRENCY_CONFIG (runs/[runId]/page.tsx:6,20) and the WPS page likewise (wps/page.tsx:10,15) — neither reads the definition currency. The engine performs no FX and all amounts are treated as the definition's nominal unit but displayed/SIF-labelled as AED. WPS is inherently AED so SIF AED is defensible, but a non-AED payroll definition would mislabel.
- **Why QA/Playwright/manual missed it:** All seed/dev definitions use AED so the hardcode coincides with reality; no non-AED definition exists in tests. Display helpers default to AED config. Compiles fine.
- **Recommended action:** Either constrain payroll definition currency to AED for WPS-reportable UAE payrolls (enforce in schema/validation), or thread definition.currency through formatting and SIF and reject WPS for non-AED. Low priority given UAE/WPS context.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** No
- **Test coverage required before accept:** Validation test: non-AED WPS-reportable definition either rejected or correctly labelled end-to-end.

##### `P2-L-ERRORS` · Status labels English-only; actions surface raw err.message to client

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** LOW
- **Area:** Payroll (WPS/EOSB/GPSSA/DEWS)
- **Evidence:** modules/payroll/types.ts:26-38 PAYROLL_RUN_STATUS_LABELS is a Record<PayrollRunStatus,string> with English-only values ('Draft','Calculated',...) — no Arabic, violating CLAUDE.md Rule 4 (bilingual mandatory) for user-facing strings. Every payroll action returns error: err instanceof Error ? err.message : String(err) (e.g. actions.ts:177,254,446,502,567,624,679,804,996,1042,1141), surfacing raw internal messages verbatim — e.g. generateWpsSif builds 'WPS validation failed: <personId>: <message>' (actions.ts:735-736) exposing person UUIDs and internal wording, English-only, with no translateError/bilingual mapping.
- **Why QA/Playwright/manual missed it:** English-only labels render fine in the default (English) test locale; RTL/Arabic suite checks layout, not whether payroll status labels have Arabic. Raw error strings still produce a visible toast so functional tests pass; nobody asserts they are bilingual or sanitized.
- **Recommended action:** Make PAYROLL_RUN_STATUS_LABELS bilingual (en/ar) like other modules. Route action errors through lib/app-error translateError (or bilingual codes) instead of raw err.message; avoid leaking person UUIDs in user-facing text.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** No
- **Test coverage required before accept:** Unit test asserting each status has en+ar; test asserting a thrown payroll error returns a bilingual/code-mapped message, not the raw internal string.

##### `P2-L-NO-WPS-DOWNLOAD` · WPS page is preview-only — no .sif/.csv export endpoint exists

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** LOW
- **Area:** Payroll (WPS/EOSB/GPSSA/DEWS)
- **Evidence:** app/(hr-admin)/payroll/wps/page.tsx renders a validation/preview table only (lines 171-241); there is no download button and no export action. find app/api and grep for sif/.csv/generateSif/downloadSif return 0 matches — no route emits an actual MoHRE SIF file. generateWpsSif (actions.ts) only inserts wps_sif_records rows and sets sifFileReference, it does not produce a downloadable file. So the bank-submittable artifact cannot be obtained from the app.
- **Why QA/Playwright/manual missed it:** There is nothing to click, so no UI test exercises a download; the feature's absence is not a failing assertion. The preview table tests pass on seeded data.
- **Recommended action:** Add a SUPER_ADMIN/PAYROLL_ADMIN-gated, entity-scoped GET route that builds the MoHRE SIF (fixed-width/CSV per spec) from wps_sif_records of a SIF_GENERATED run and streams it with Content-Disposition; audit the download.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** No
- **Test coverage required before accept:** Integration test: SIF_GENERATED run → export route returns a correctly-formatted SIF body; unauthorized/cross-entity → 403.

##### `P2-M-EOSB-PROVISION` · Monthly EOSB provision formula eosbFinalAmount/(serviceYears*12) is non-standard and self-correcting only by luck

- **Classification:** PARTIALLY_REAL
- **Severity (verified):** LOW
- **Area:** Payroll (WPS/EOSB/GPSSA/DEWS)
- **Evidence:** calculation-engine.ts:108-109 monthsOfService = max(1, eosbResult.serviceYears*12); eosbProvision = eosbFinalAmount / monthsOfService. This spreads the TOTAL accrued-to-date EOSB evenly across all months of service to date, i.e. it is a retrospective average accrual, not a true incremental monthly accrual. For the cap/rate-tier boundaries (21 days <5yr, 30 days >5yr, 24-month cap) the average-to-date and incremental amounts diverge — the per-month figure understates accrual in early years and overstates after rate step-ups, and once capped the provision keeps dividing a frozen total by a growing denominator (provision shrinks over time). It is a defensible simplification, not a hard bug, and serviceYears>=1 guard (line 106) avoids div-by-zero (max(1,...) further guards).
- **Why QA/Playwright/manual missed it:** There is a unit test for the pure calculateEosb total, but the provision-spreading formula in the engine is an accounting-policy choice; tests assert it computes a number, not that it matches an incremental accrual standard. Correctness is a finance-policy judgment.
- **Recommended action:** Confirm with finance whether monthly provision should be incremental (delta of accrued EOSB vs prior month) rather than average-to-date; if so, store prior accrued and book the difference. Otherwise document the averaging policy explicitly.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** No
- **Test coverage required before accept:** Unit test pinning the agreed provision method (incremental vs average-to-date) across the 5-year tier boundary and the cap.

##### `P2-M-NET-FLOOR` · netPay = max(0, gross - deductions) silently hides negative net (over-deduction)

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** LOW
- **Area:** Payroll (WPS/EOSB/GPSSA/DEWS)
- **Evidence:** calculation-engine.ts:92 netPay = r2(Math.max(0, totalGrossPay - totalDeductions)). When deductions exceed gross (e.g. large salary advance recovery on a prorated/suspended month), the true negative net is clamped to 0 with no flag, no carry-forward, and no warning — the deduction shortfall just disappears and the variance check (lines 130-136) only compares net to prior net.
- **Why QA/Playwright/manual missed it:** Normal fixtures have gross>deductions, so the clamp never engages; tests assert net is a non-negative number, which the clamp guarantees. Edge case (deductions>gross) is not in any fixture.
- **Recommended action:** Detect totalDeductions>totalGrossPay: either flag the result (e.g. set a negative-net warning / variance reason and require manual review) and/or carry the unrecovered balance forward, rather than silently zeroing it.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** No
- **Test coverage required before accept:** Unit test: deductions > gross → assert a flag/warning is produced rather than a silent 0 net.

##### `P1-L(self-mgr)` · lineManagerId / dottedLineManagerId can be set to self or form a cycle; server action has no guard (UI filters self only)

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** LOW
- **Area:** Persons / Employee Master
- **Evidence:** UpdatePersonSchema only type-checks lineManagerId/dottedLineManagerId as uuid (validations.ts:212,217); CreatePersonSchema.PersonEmployment same (validations.ts:120-121). Neither createPerson (actions.ts:208-209) nor updatePerson (actions.ts:740,746) compares the manager id to the person's own id or walks the reporting chain for cycles. The ONLY self-protection is client-side: edit/page.tsx:280 `managerOptions={managerRows.filter(m => m.id !== person.id)}` removes self from the dropdown — trivially bypassed by a forged Server Action argument. dottedLineManagerId is not even filtered in the UI. A cycle (A→B, B→A) is likewise unguarded. evaluateManagerRole (called at actions.ts:826/829) walks reporting but does not reject self/cycle.
- **Why QA/Playwright/manual missed it:** The UI never offers self as line manager, so all click-driven Playwright flows produce valid hierarchies and pass. Self/cycle assignment requires either a forged Server Action payload or directly invoking updatePerson with personId===lineManagerId — outside normal UI testing. Typecheck is satisfied (both are valid uuids).
- **Recommended action:** Add a server-side guard in createPerson/updatePerson: reject lineManagerId===personId and dottedLineManagerId===personId (bilingual error). For full cycle prevention, optionally walk the line-manager chain (bounded depth) before commit and reject if personId reappears. Low severity because impact is data-quality/org-chart loops, not a security/PII breach.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** Yes
- **Test coverage required before accept:** Unit/integration: updatePerson with lineManagerId===personId rejected; dottedLineManagerId===personId rejected; A→B then B→A rejected (if cycle walk added). Org-chart build-tree should be checked for safe handling of any pre-existing cyclic rows.

##### `P1-M(dates)` · DOB future/min-age, hireDate vs DOB, visa/passport expiry-before-issue not validated server-side

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** LOW
- **Area:** Persons / Employee Master
- **Evidence:** dateOfBirth uses hrDateString() (validations.ts:66) which only enforces format YYYY-MM-DD and year in [1900,2099] (lib/validation/date-validators.ts:55-69) — a future DOB up to 2099 and a 5-year-old are both accepted; no min-age or 'DOB must be in the past' check anywhere (grep for age/minAge/18 found nothing in the three core-hr files). CreatePersonSchema.superRefine (validations.ts:152-184) only validates BR-PR-001 (probationEndDate vs hireDate +6mo and probEnd >= hire) and the UAE_NATIONAL→ARE rule — NO hireDate-vs-DOB check, NO visaExpiry>visaIssueDate, NO passportExpiry>passportIssueDate (passportIssueDate/passportExpiry/visaIssueDate/visaExpiry are each independently optional hrDateString, validations.ts:88-93, with no cross-field refine). updatePerson/edit-person have no superRefine at all. So a hireDate before DOB, or an expiry before issue, passes validation and persists.
- **Why QA/Playwright/manual missed it:** These are cross-field semantic rules; the form normally collects sensible dates so green-path E2E and manual hires never trip them. hrDateString passes any well-formed in-range date, so typecheck/build are clean. Catching the gap requires deliberately entering an inverted date pair, which is not part of functional testing.
- **Recommended action:** NEEDS_BUSINESS_DECISION on the exact minimum working age (UAE Labour Law minimum is 18 for standard employment; juvenile permits 15-18 exist) before hard-coding a min-age. Then add superRefine rules: dateOfBirth must be in the past and yield age >= configured minimum; hireDate >= dateOfBirth (+ min working age); passportExpiry > passportIssueDate; visaExpiry > visaIssueDate; emiratesIdExpiry/labourCardExpiry sanity. Apply to CreatePersonSchema and add an equivalent refine path to the update schemas. Low severity (data quality, not security).
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** No
- **Test coverage required before accept:** Unit tests on the schema: future DOB rejected; underage DOB rejected (per chosen min-age); hireDate < DOB rejected; passportExpiry <= passportIssueDate rejected; visaExpiry <= visaIssueDate rejected; valid combinations accepted.

##### `P2-L(BR-29 delegate)` · Delegate button only renders after expanding panel + typing value — not visible by default

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** LOW
- **Area:** Timesheets + Workflow approval engine
- **Evidence:** app/(hr-admin)/approvals/[instanceId]/action-form.tsx:175 `{canDelegate && showDelegate && delegateTo.trim() && (<button>Delegate</button>)}` — the Delegate action button is hidden until the user (a) clicks 'Delegate to another person' to set showDelegate (82-97) AND (b) types a non-empty value. By default only Approve+Reject show, violating BR-29 (canonical Approve/Reject/Delegate set must be exposed) and MEMORY note 'feedback_workflow_decisions'.
- **Why QA/Playwright/manual missed it:** E2E asserts Approve/Reject presence and the expand link; it doesn't assert a persistently-visible Delegate button. Visually the link exists so it 'looks' compliant.
- **Recommended action:** Render the Delegate button alongside Approve/Reject whenever canDelegate && !isFyiOnly, and validate the target on click (with the expand acting as the input area), matching BR-29.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** No
- **Test coverage required before accept:** E2E: on an approvable step with canDelegate, all three buttons visible without prior interaction.

##### `P2-L(approval bilingual)` · action-form/StepEditorDrawer/[instanceId] English-only; inbox list IS bilingual (inconsistency)

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** LOW
- **Area:** Timesheets + Workflow approval engine
- **Evidence:** app/(hr-admin)/approvals/page.tsx is bilingual (getLocale + `locale==='ar' ? '...':'...'` at 102,105,164,167). app/(hr-admin)/approvals/[instanceId]/action-form.tsx is entirely hardcoded English: 'Your decision' (54), 'Comment' (60), 'Approve' (158), 'Reject' (172), 'Delegate to another person' (91), 'Delegate' (188), error strings (26,43). resourceLabel in page.tsx (60-69) returns English-only labels. This violates ADR-001 rule 4 (every user-facing string EN+AR).
- **Why QA/Playwright/manual missed it:** Bilingual audit (RTL Phase 2 Task 6) focused on layout/RTL direction, not string coverage of this client component; both languages render the same English text so no functional/visual regression flagged.
- **Recommended action:** Localise action-form.tsx, StepEditorDrawer.tsx, [instanceId]/page.tsx and resourceLabel with EN/AR pairs consistent with the inbox.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** No
- **Test coverage required before accept:** i18n snapshot of approval action panel in ar locale shows Arabic labels.

##### `P2-L(resourceLabel)` · approvals/page.tsx resourceLabel map missing hiring/transfer/probation/persons types

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** LOW
- **Area:** Timesheets + Workflow approval engine
- **Evidence:** app/(hr-admin)/approvals/page.tsx resourceLabel (60-69) maps only absence_entries, worker_assignment, overtime_entry, salary_revision, preview and falls back to the raw `type`. Real resourceType values that reach approvals lack entries: modules/core-hr/org-chart-actions.ts:222 'hiring_requests', :317 'transfer_requests'; modules/core-hr/probation/workflow-actions.ts 'probation_reviews'; modules/core-hr/probation/actions.ts:81 & workflow-actions.ts:676 'persons'. These render to approvers as raw strings like 'hiring_requests'. (Aside: dispatchResourceCompletion handles 'probation_review' singular while the emitted type is 'probation_reviews' plural — a separate latent mismatch, not part of this finding.)
- **Why QA/Playwright/manual missed it:** Approvals E2E fixtures predominantly use leave (absence_entries) which is mapped; hiring/transfer/probation approvals weren't asserted for label text. Fallback returns a string so nothing errors.
- **Recommended action:** Add bilingual labels for hiring_requests, transfer_requests, probation_reviews, persons to resourceLabel; consider a shared mapping to avoid drift.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** No
- **Test coverage required before accept:** Unit/E2E: approval rows for each resourceType show a friendly label, never the raw type.

##### `P2-M(SLA deadline)` · calculateDeadlineFromMs no min-bound on slaHours; per-step slaHours not server-validated; misconfig → 5yr or instant breach

- **Classification:** PARTIALLY_REAL
- **Severity (verified):** LOW
- **Area:** Timesheets + Workflow approval engine
- **Evidence:** lib/workflow-sla.ts calculateDeadlineFromMs (99-163) caps iterations at 5*260 working days but does NOT validate slaWorkingHours: a 0 or negative value yields a deadline at/just after `fromDate` → instant SLA breach on next cron tick; a very large value walks up to ~5 working-years then returns `cursor` (the cap, not an error). Per-step slaHours IS unvalidated on the server: modules/workflow/actions.ts createWorkflowStep:735 and updateWorkflowStep:789 insert input.slaHours with no bound check (only definition-level defaultSlaHours is bounded 1-720 at 494-497 and 572-576). StepEditorDrawer:295 has client-only min={1}. HOWEVER 'misconfigured calendar -> 5yr or instant-breach' is overstated: the loop cap bounds runaway to ~5 years and instant breach only triggers SEND_REMINDER/ESCALATE (cron), not silent loss; activateNextStep:322 also defaults missing step SLA to 48h. So the real scope is unvalidated per-step slaHours + no lower bound, not an unbounded hang.
- **Why QA/Playwright/manual missed it:** Admin tests always enter sane SLA (e.g. 24/48). Negative/zero per-step SLA must be sent via a forged Server Action arg (client input is number-coerced and min=1), so the page test never produces it. The iteration cap prevents any visible hang.
- **Recommended action:** Validate slaHours (and per-step) is an integer within 1..720 in createWorkflowStep/updateWorkflowStep (reuse the definition-level check); add a guard in calculateDeadlineFromMs to coerce slaWorkingHours<=0 to the definition default.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** Yes
- **Test coverage required before accept:** Unit: createWorkflowStep slaHours=0/-5/9999 → rejected; calculateDeadlineFromMs(0) → not instant-breach.

##### `P2-M(exception validation)` · submitExceptionRequest no allowlist/future-date/time-order validation; reviewExceptionRequest applies unvalidated times

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** LOW
- **Area:** Timesheets + Workflow approval engine
- **Evidence:** modules/timesheets/actions.ts submitExceptionRequest (483-528) inserts exceptionType, exceptionDate, requestedTimeIn/Out straight from params with no validation: exceptionType is free-form (schema comment lists LATE_COMING|EARLY_LEAVING|MISS_PUNCH|BUSINESS_MEETING|OTHER but no CHECK/enum enforced), exceptionDate may be far future, requestedTimeIn may be after requestedTimeOut. reviewExceptionRequest (532-634) on APPROVED applies those exact times to attendanceRecords (585-603) via calcWorkedHours which Math.max(0) clamps reversed to 0 — so an invalid request silently produces a 0-hour PRESENT day.
- **Why QA/Playwright/manual missed it:** ESS form supplies valid type/date/time, so the happy path is clean; malformed values require a forged Server Action call. The Math.max clamp hides reversed times as 0 rather than an error.
- **Recommended action:** Add a Zod schema: exceptionType in the allowed set, exceptionDate not in the future, requestedTimeOut>requestedTimeIn; re-validate in reviewExceptionRequest before applying to the attendance record.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** No
- **Test coverage required before accept:** Unit: invalid exceptionType / future date / reversed times → rejected at submit and at review.

##### `P1-H10` · Schedule source badge mislabels entity-default as EMPLOYEE_OVERRIDE after HR edit

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** LOW
- **Area:** Worker Assignments / Work Schedules / MDM
- **Evidence:** modules/profile/actions.ts:441-443 scheduleSource = assignmentReason === 'AUTO_HIRED' ? 'ENTITY_DEFAULT' : 'EMPLOYEE_OVERRIDE'. createPerson sets assignmentReason: 'AUTO_HIRED' (modules/core-hr/actions.ts:297). But every HR edit hardcodes assignmentReason: 'HR_ADMIN_UPDATE' (app/(hr-admin)/persons/[id]/edit/PersonEditForm.tsx:453). So re-selecting (or selecting) the entity default schedule via the HR edit form persists reason HR_ADMIN_UPDATE, and the ESS badge then reads EMPLOYEE_OVERRIDE even though it equals the entity default. The badge reflects 'how it was set' not 'what it is'.
- **Why QA/Playwright/manual missed it:** Display-only mislabel; no functional/typecheck/build impact. Playwright assertions (WCL tests) check the AUTO_HIRED->ENTITY_DEFAULT and override->EMPLOYEE_OVERRIDE happy paths, not the 'HR re-selected the entity default' edge. Cosmetic, only visible on the ESS Employment tab.
- **Recommended action:** Derive scheduleSource by comparing the resolved workScheduleId to the entity's current isDefault schedule id (ENTITY_DEFAULT when equal, EMPLOYEE_OVERRIDE otherwise) instead of inferring from the free-text assignmentReason.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** No
- **Test coverage required before accept:** Unit: HR edit selecting the entity default schedule should render ENTITY_DEFAULT badge; selecting a non-default should render EMPLOYEE_OVERRIDE.

##### `P1-L(correctWS)` · correctWorkScheduleAssignment sets correctsRowId: null while actionMode='CORRECTION', and does no entity re-validation

- **Classification:** PARTIALLY_REAL
- **Severity (verified):** LOW
- **Area:** Worker Assignments / Work Schedules / MDM
- **Evidence:** modules/core-hr/work-schedule-assignment-actions.ts:161-162 sets actionMode: 'CORRECTION' but correctsRowId: null in the SAME UPDATE applied to the row being corrected (line 167 WHERE id = data.assignmentId). Because it is an in-place UPDATE of the current row (not a new row pointing back to a prior version), correctsRowId being null is internally consistent with the documented 'in-place correction without creating history' design (header comment lines 132-134) — but it leaves the CORRECTION marker with no link, making the audit/history semantics ambiguous. Separately, no entity re-validation: data.workScheduleId (CorrectAssignmentSchema:30 z.string().uuid().optional()) is written (line 157) with no check that it is active or belongs to current.legalEntityId. Restricted to HR_DIRECTOR/SUPER_ADMIN (line 140).
- **Why QA/Playwright/manual missed it:** Correction is a rarely-exercised HR_DIRECTOR/SUPER_ADMIN path; the correctsRowId semantics are cosmetic/audit-only and never asserted. The missing entity check requires a forged or careless cross-entity workScheduleId, not the UI happy path. Build/typecheck pass.
- **Recommended action:** Decide the intended correction semantics: if in-place, leaving correctsRowId null is acceptable but document it; if versioned, write the prior row id. Add the same active/entity validation as recommended in P1-H7 for any caller-supplied workScheduleId.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** No
- **Test coverage required before accept:** Unit: correction with cross-entity/inactive workScheduleId rejected; correctsRowId/actionMode semantics asserted to match documented design.

##### `P1-L(revalidatePath)` · assignWorkSchedule revalidates '/employees' instead of the persons route

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** LOW
- **Area:** Worker Assignments / Work Schedules / MDM
- **Evidence:** modules/core-hr/work-schedule-assignment-actions.ts:125 revalidatePath('/employees') and :189 (correctWorkScheduleAssignment) revalidatePath('/employees'). Per CLAUDE.md the HR Admin employee routes live under app/(hr-admin)/persons/ (e.g. /persons/[id], /persons/[id]/edit) and ESS under /me — there is no /employees route group in the app/ tree. So the revalidation targets a path that does not correspond to the pages showing the schedule (the person detail/edit page and /me profile), leaving them potentially stale until a natural refresh.
- **Why QA/Playwright/manual missed it:** revalidatePath to a non-existent path is a no-op, not an error — build/typecheck pass and Playwright tests typically navigate/reload fresh pages so they never observe the stale cache. Purely a cache-freshness nit.
- **Recommended action:** Revalidate the actual routes: revalidatePath(`/persons/${personId}`) and `/persons/${personId}/edit` (and `/me` for ESS) instead of the stale '/employees'.
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** No
- **Test coverage required before accept:** None strictly required; optional assertion that revalidatePath targets the persons/[id] route.

##### `P1-M(assignmentReason)` · assignmentReason is free-text varchar(200) but badge logic treats it as an enum

- **Classification:** CONFIRMED_REAL
- **Severity (verified):** LOW
- **Area:** Worker Assignments / Work Schedules / MDM
- **Evidence:** drizzle/schema/foundation.ts:985 assignmentReason varchar('assignment_reason', {length:200}) — free text, no CHECK constraint, no enum. AssignSchema (work-schedule-assignment-actions.ts:21) validates only z.string().max(200).optional().nullable(). Yet modules/profile/actions.ts:441 branches on the literal === 'AUTO_HIRED'. Any value other than exactly 'AUTO_HIRED' (including AUTO_HIRED with different casing, or any future reason string) silently becomes EMPLOYEE_OVERRIDE. This is the structural root cause underlying P1-H10.
- **Why QA/Playwright/manual missed it:** Same as P1-H10 — the two known writers ('AUTO_HIRED', 'HR_ADMIN_UPDATE') are the only values seen in tests/UI, so the brittle string-equality never breaks in QA. No type-level enforcement so typecheck cannot catch it.
- **Recommended action:** Either constrain assignmentReason to a documented enum (Zod enum + DB CHECK) and treat it as such, or stop deriving display semantics from it and compute scheduleSource from the actual schedule id vs entity default (preferred — see P1-H10).
- **Schema change required:** No · **Data migration/backfill:** No · **Affects other modules:** Yes
- **Test coverage required before accept:** Unit: badge derivation independent of arbitrary assignmentReason text; enum validation if adopted.

##### `P1-M(scheduleNameAr)` · work_schedules.scheduleNameAr nullable / .optional() vs departments.nameAr notNull (Rule 4 bilingual)

- **Classification:** PARTIALLY_REAL
- **Severity (verified):** LOW
- **Area:** Worker Assignments / Work Schedules / MDM
- **Evidence:** drizzle/schema/configuration.ts:162 scheduleNameAr varchar(200) — nullable (no .notNull()), and WorkScheduleActions.ts:58 scheduleNameAr z.string().max(200).optional(). Contrast departments.nameAr foundation.ts:72 .notNull(). HOWEVER the Rule-4 concern is mitigated at runtime: createWorkSchedule:118-120 and updateWorkSchedule:216-218 auto-translate EN->AR (translateToArabic) whenever scheduleNameAr is empty or EN changed, then persist scheduleNameAr ?? null. So in practice AR is populated for all UI-created schedules; only a direct insert bypassing the action, or a translation failure returning null, leaves AR null.
- **Why QA/Playwright/manual missed it:** Schema-level nullability is invisible to functional tests because the action always backfills AR via auto-translate; QA never sees a null AR name. The inconsistency is structural, not behavioral, so build/Playwright pass.
- **Recommended action:** For consistency with the bilingual mandate, either make scheduleNameAr NOT NULL (after backfilling any existing null rows) with the action's auto-translate guaranteeing a value, or explicitly document scheduleNameAr as intentionally nullable. Lower priority given the runtime auto-translate mitigation.
- **Schema change required:** Yes · **Data migration/backfill:** Yes · **Affects other modules:** No
- **Test coverage required before accept:** Integration: creating a schedule with blank AR yields a non-null AR (auto-translate); if NOT NULL adopted, backfill verification.

---

## Deliverable 2 — Dependency-Safe Fix Waves

Grouping obeys the strict rules: each wave is fully fixable without a later wave; no wave depends on an earlier wave still being incomplete; schema-migration fixes are not mixed with pure-UI fixes; authorization fixes are not mixed with payroll calculation unless they share a root dependency. Shared-utility changes are isolated in Foundation **Wave 0** and validated before dependents.

### W0 — Foundation — shared identity/scope/lock/audit-tx utilities (no behavior change on its own)

- **Included finding IDs:** `P3-A1`, `P3-D2`
- **Why these belong together:** Every later wave depends on three primitives that today are either missing or inconsistently applied: (1) a session-identity re-derivation contract, (2) an entity/team scope assertion, (3) a per-key advisory-lock + audit-in-tx pattern. The codebase ALREADY has the building blocks — getCurrentUser()/requireRole() (lib/auth.ts:483/516), a manager recursive-team resolver (lib/leave-person-scope.ts), DbOrTx/Tx (lib/db.ts:61-62), transactional writeAuditLog(tx) (lib/audit.ts:38), encrypt/decrypt (lib/encryption.ts:45/54), and pg_advisory_xact_lock already used in createLeaveRequest/payroll. W0 promotes these into small, named, tested shared helpers so W1–W7 are one-line call sites rather than divergent re-implementations. The single biggest shared root cause behind P3-A1, P3-A2, P3-A3, P3-A5, P3-A6, P3-A7, P2-P3, P2-T5, P1-H7, P2-L3 is 'trust caller-supplied identity instead of re-deriving from session' — W0 builds the canonical re-derivation + entity-scope helpers so each of those becomes a guard call. P3-D2 (feature_permissions never enforced) belongs here as a DECISION GATE: either build the requirePermission(featureKey,action) resolver as the fourth foundation primitive, or formally mark the matrix advisory; downstream RBAC waves must know which before they wire gates.
- **Why this wave is independent:** W0 introduces NEW helpers and adds re-derivation INSIDE the ARIA entry point (P3-A1) which is itself the canonical demonstration of the helper. It does not require any other defect to be fixed first — it only consumes already-existing primitives. P3-A1 is included here (not W1) because sendAriaMessage's re-derivation is the reference implementation every other authorization fix copies; landing it in foundation lets W1 reuse the exact pattern. No schema change. If the team chooses NOT to build requirePermission, P3-D2 collapses to a docs/UI-label change and W0 ships only the identity+scope+lock helpers.
- **Files likely to change:** NEW lib/session-identity.ts (deriveActorIdentity(): re-reads personId/role/legalEntityId from auth(), never trusts args); NEW lib/access/entity-scope.ts (assertSameEntity(actor, targetEntityId), assertSelfOrTeam(actor, targetPersonId) reusing lib/leave-person-scope team walk); OPTIONAL NEW lib/access/feature-permission.ts (requirePermission); NEW lib/locks.ts (withPersonLock/withEntityLock wrapping pg_advisory_xact_lock(hashtext(...))); EDIT lib/db.ts (re-export Tx/DbOrTx if not already public — confirmed already exported); EDIT modules/aria/actions.ts sendAriaMessage + submitConfirmedLeaveRequest to consume deriveActorIdentity (P3-A1 reference impl); lib/audit.ts unchanged (already tx-aware).
- **Schema / migration impact:** None. Pure code/utility introduction. No migration. feature_permissions table already exists (P3-D2) — resolver only reads it.
- **Tests required:** Unit: deriveActorIdentity ignores forged personId/role/legalEntityId and returns session values; assertSameEntity throws FORBIDDEN on mismatch, allows SUPER_ADMIN; assertSelfOrTeam allows self, allows manager's recursive report, denies stranger; withPersonLock/withEntityLock acquire pg_advisory_xact_lock with the documented hashtext key (source-inspection + integration). Integration P3-A1: forge sessionCtx.personId+role='HR_ADMIN' → leave created for SESSION person, COMPLIANCE_QUERY denied for real EMPLOYEE. If requirePermission built: toggling a matrix cell actually denies the gated action.
- **Playwright / manual validation:** No UI. Manual: confirm ARIA chat still works end-to-end for a real EMPLOYEE and HR_ADMIN (regression that re-derivation did not break the honest path). Forge a sendAriaMessage Server Action POST with a foreign personId via browser devtools/curl and confirm it acts as the session user.
- **Residual-risk checks:** Confirm deriveActorIdentity throws (not silently defaults) when session.personId is null — this protects P3-A4/P3-A5. Confirm no other caller relied on the previously-trusted ctx fields for legitimate non-identity data (language pref must still flow from client).
- **Definition of done:** Helpers exist, unit-tested, exported via lib barrels; ARIA P3-A1 re-derivation merged and green; DECISION recorded on P3-D2 (build resolver vs mark advisory); 0 TS errors; full unit suite green; no behavior change on honest paths.

### W1 — Critical authorization + PII exposure — identity re-derivation & self/team/entity IDOR gates

- **Included finding IDs:** `P3-A3`, `P3-A5`, `P3-A2`, `P3-A6`, `P3-A7`, `P3-D1`, `P3-A4`, `P3-L-BRIEFING-NOGATE`, `P3-M-FALLBACK-EMAIL`
- **Why these belong together:** These are all instances of the SAME W0 root cause — a 'use server' action or route that trusts caller-supplied identity/entity or has no auth gate — now fixable as one-line guard insertions using W0's deriveActorIdentity / assertSameEntity / assertSelfOrTeam. They share blast radius: any authenticated user can currently read company-wide PII (P3-A3 getExpiryAlerts returns passport/visa/EID for 200 people with NO auth), generate another employee's salary certificate (P3-A5), read another's leave (P3-A2) / enrolments (P3-A6), or operate cross-entity insurance (P3-A7). P3-D1 (DataOps read routes lean on middleware only) is the same pattern at the API layer — add requireRole(['SUPER_ADMIN']) per handler. P3-A4 (signing guard predicated on if(session) and short-circuits on null personId) is the fail-open variant — fixed with W0's 'throw on null personId'. P3-M-FALLBACK-EMAIL (hardcoded personal address receives PII letters) and P3-L-BRIEFING-NOGATE (quota-abuse, no gate) ride along because they are the same module and the same 'add the missing guard / remove the unsafe default' edit class.
- **Why this wave is independent:** Every item is a localized guard insertion at a function/route entry; none depends on payroll calc, leave-balance, schema, or workflow fixes. They depend ONLY on W0 helpers being present. No two items in this wave depend on each other — they touch different actions (aria/os-actions.ts, employee-letters/actions.ts, insurance/actions.ts, api/dataops/*). Must precede W2 because W2's payroll entity-scope (P2-P3) reuses the identical assertSameEntity helper and pattern proven here, but W1 itself needs nothing from W2.
- **Files likely to change:** modules/aria/os-actions.ts (getExpiryAlerts/getComplianceData/getKnowledgeSources/getPeopleStats add getCurrentUser+requireRole+entity scope — P3-A3); modules/aria/services.ts (P3-A2 target_person_id branch → requireRole(MANAGER+) + team scope); modules/employee-letters/actions.ts (P3-A5 force personId=session.personId for EMPLOYEE; P3-A4 fail-closed signing; P3-M-FALLBACK-EMAIL remove hardcoded address); modules/aria/actions.ts (P3-L-BRIEFING-NOGATE gate generateDailyBriefing); modules/insurance/actions.ts (P3-A6 self/team gate on getPersonEnrolments/getActiveEnrolment; P3-A7 assertSameEntity on enrol/cancel/extend/contractor-exception); app/api/dataops/{execute,nl2sql,saved-queries,schema,audit,rows}/route.ts (P3-D1 add requireRole(['SUPER_ADMIN']) to read handlers).
- **Schema / migration impact:** None. All guard insertions. (P3-M-FALLBACK-EMAIL may optionally reference a future per-entity HR mailbox column — defer that column to W6; W1 fix is simply 'fail the send' when no work email.)
- **Tests required:** Integration per item: EMPLOYEE forging another personId on requestLetter/getPersonEnrolments/ARIA target_person_id → acts on self or FORBIDDEN; EMPLOYEE invoking getExpiryAlerts/getComplianceData/getPeopleStats/getKnowledgeSources/generateDailyBriefing → FORBIDDEN; HR_ADMIN entity-A enrolling/cancelling against entity-B → FORBIDDEN, SUPER_ADMIN allowed; cross-entity HR_ADMIN getExpiryAlerts sees only own entity; forged HR_ADMIN session against each /api/dataops read route → 403; signing with null/foreign personId → rejected; person with no WORK_EMAIL → letter send returns failure, hardcoded address never used.
- **Playwright / manual validation:** Manual forged-payload tests (curl/devtools) per action — cannot be done via normal UI clicks since the UI always sends honest ids. Playwright regression: honest EMPLOYEE ESS letters/insurance/ARIA flows and HR_ADMIN ARIA OS panels still render and function. Manual: confirm /admin/dataops still works for SUPER_ADMIN and is 403 for HR_ADMIN at the API.
- **Residual-risk checks:** Confirm getExpiryAlerts entity-scopes for non-SUPER_ADMIN (not just role-gates). Confirm DataOps access-policy.ts row-filter branches are either now reachable or explicitly deleted (avoid dead-code false security). Confirm MANAGER team scope in P3-A2/P3-A6 uses recursive reports, not just direct. Confirm no honest path regressed (ARIA daily briefing still callable by admin home).
- **Definition of done:** All listed actions/routes re-derive identity or assert scope via W0 helpers; forged-payload integration tests green; honest-path Playwright green; 0 TS errors; audit rows still record the real actor; CLAUDE.md known-issue list updated for P3-D1/P3-D2.

### W2 — Payroll / WPS / IBAN / entity-scope integrity (legally-mandated pay channel)

- **Included finding IDs:** `P2-P3`, `P2-P1`, `P2-P2`, `P2-P4`, `P2-P5`, `P2-M-DEWS-GPSSA-YTD`, `P2-M-PRORATION`, `P2-M-EOSB-UNPAID`, `P2-M-MEDICAL`, `P2-M-NET-FLOOR`, `P2-L-CURRENCY`, `P2-L-ERRORS`, `P2-L-NO-WPS-DOWNLOAD`, `P2-M-EOSB-PROVISION`
- **Why these belong together:** All findings live in the payroll engine/actions (modules/payroll/*) and most touch the same two functions: calculatePayrollRun and generateWpsSif. They form one coherent correctness front: WPS cannot produce a SIF at all (P2-P1 — iban/bankCode never populated), and the moment that write path is wired it would persist IBAN in plaintext-sized columns (P2-P2) — so P2-P1 and P2-P2 MUST be fixed together (wire bank details + decide encrypted-at-rest vs read-at-emit). P2-P3 (cross-entity payroll disclosure) reuses W1's proven assertSameEntity pattern and must land with the payroll changes since it touches the same queries/page. P2-P4 (run_number global-unique vs per-entity MAX) and P2-P5 (no duplicate-period guard) are the same createPayrollRun insert path. The calc gaps (DEWS/GPSSA/YTD never written, no proration, EOSB ignores unpaid leave, medical /12 + dead employer ternary, net-floor hides negatives, hardcoded AED) are all inside calculatePayrollRun/calculation-engine and should be verified together against one end-to-end DRAFT→SIF_GENERATED integration test. Grouped per the strict rule: payroll-calculation fixes stay together and are NOT mixed with W1 security beyond the shared entity-scope helper (P2-P3) which is the single shared dependency permitted.
- **Why this wave is independent:** Depends only on W0 (assertSameEntity, encrypt helper already exist) and the entity-scope pattern validated in W1. Does not depend on leave/workflow/MDM. P2-P2 schema decision (widen columns vs never-persist) is self-contained to payroll tables. Must run after W1 so the entity-scope helper is battle-tested, and before any go-live since WPS is the legally-mandated UAE pay channel currently 100% non-functional.
- **Files likely to change:** modules/payroll/actions.ts (calculatePayrollRun: join+decrypt person_bank_details → iban/bankCode; insert gpssa/dews rows; computeYtd accumulation; proration factor; pass totalUnpaidLeaveDays; nextRunNumber+constraint; duplicate-period SELECT; route errors via translateError; bilingual status labels in types.ts); modules/payroll/calculation-engine.ts (proration, medicalInsuranceEr real value, EOSB unpaid leave input, net-floor flag, EOSB provision policy); modules/payroll/queries.ts (getPayrollRunById/result/variance add legalEntityId scope — P2-P3); modules/payroll/types.ts (bilingual PAYROLL_RUN_STATUS_LABELS); app/(hr-admin)/payroll/runs/[runId]/page.tsx (entity guard); NEW app/api/payroll/wps/[runId]/route.ts (SIF export, SUPER_ADMIN/PAYROLL_ADMIN, entity-scoped — P2-L-NO-WPS-DOWNLOAD); NEW migration 0055 (run_number composite unique OR global scheme; P2-P2 column widening if encrypted-at-rest chosen).
- **Schema / migration impact:** SCHEMA CHANGE in this wave: migration 0055 — (a) P2-P4 drop global UNIQUE(run_number), add UNIQUE(tenant_id,legal_entity_id,run_number) [or adopt global-prefixed scheme]; (b) P2-P2 IF encrypted-at-rest chosen, widen payroll_results.iban + wps_sif_records.iban 23→500 (no data migration — columns currently empty because P2-P1 means nothing was ever stored). P2-P5 optional partial-unique on (payroll_id,pay_period_start,pay_period_end) for REGULAR. Manual-apply via Neon SQL Editor per project migration convention (journal stops at 0039); next slot 0055. Rollback: drop new indexes / revert column width.
- **Tests required:** Integration DRAFT→SIF_GENERATED: seed encrypted person_bank_details + active employees → calculatePayrollRun then generateWpsSif → wps_sif_records created with correct iban/routing, run.status=SIF_GENERATED. Security: any persisted iban is ciphertext (not AE\d{21}) OR never persisted. Integration: actor entity-A on runId entity-B → 404/FORBIDDEN for query + every mutation; SUPER_ADMIN allowed. Concurrency: two entities at seq 1 concurrently → both succeed distinct numbers. Duplicate overlapping REGULAR period → rejected. Unit: BIWEEKLY/WEEKLY medical per-period; employer medical>0 in totalEmployerCost; EOSB reflects unpaid days; two consecutive periods → ytd=sum + gpssa(UAE national)+dews(DIFC) rows; prorated hire/term gross; deductions>gross → flag not silent 0; non-AED definition rejected/labelled; status labels en+ar; payroll error returns bilingual/code-mapped string (no raw UUID).
- **Playwright / manual validation:** Manual: run a full payroll cycle in UI for a seeded entity, confirm SIF export button downloads a correctly-formatted MoHRE SIF; confirm cross-entity runId in URL is blocked. Playwright: payroll run-detail page renders for own entity, status labels show Arabic under locale=ar.
- **Residual-risk checks:** Confirm IBAN decrypted only at SIF-emit, never logged. Confirm proration convention (calendar vs 30-day) signed off by finance before shipping. Confirm EOSB provision policy (incremental vs average-to-date, P2-M-EOSB-PROVISION) recorded as accepted accounting policy or changed. Confirm 23505 surfaces friendly bilingual message. Confirm SIF export route audits the download and is entity-scoped.
- **Definition of done:** End-to-end DRAFT→SIF_GENERATED green with real bank data; IBAN never plaintext-at-rest (or never persisted); cross-entity payroll access blocked; run-number collision impossible; DEWS/GPSSA/YTD/proration/medical correct; SIF downloadable; bilingual labels+errors; migration 0055 applied to Neon; 0 TS errors; finance sign-off on proration+provision policy.

### W3 — Leave balance reservation / cross-year / terminated-target / duration integrity

- **Included finding IDs:** `P2-L1`, `P2-M-cross-year`, `P2-L3`, `P2-M-resubmit`, `P2-L4`, `P2-M-decide-double-tx`, `P2-L-RECALLED`, `P2-L-ESS-bilingual`
- **Why these belong together:** All center on the leave-balance write path in modules/absence/actions.ts and the shared closing-balance formula in services.ts. P2-L1 is the keystone (HIGH): pendingDays is NEVER incremented, so the balance gate cannot stop over-committing — every other balance finding interacts with the same submit/decide transaction, so they must be fixed coherently to avoid double-counting. P2-M-cross-year (Dec→Jan debits only start-year row) and P2-M-resubmit (REJECTED re-submit skips overlap/balance re-check) both touch the same debit/gate logic and are explicitly entangled with P2-L1 (re-submit's balance angle is subsumed once reservation exists). P2-L3 (HR can file leave for a terminated person — no isActive/assignmentStatus check) reuses W0's active-gate pattern and lives in the same loadPersonScope read inside createLeaveRequest. P2-L4 (ESS available>total arithmetic) and P2-L-ESS-bilingual (English-only status chips) are the ESS-page consumers of the same balance derivation — fixing them alongside avoids a second pass over me/leave/page.tsx. P2-M-decide-double-tx is verified mostly-benign (idempotent status, balance written once) — included only to formally close it / optional cleanup, and it sits in the same decideLeaveRequest function. P2-L-RECALLED (dead status) is the same enum/status surface. Per strict rule, leave-balance fixes are isolated from payroll; the only shared utility (advisory lock, audit-in-tx) already landed in W0, so no cross-contamination.
- **Why this wave is independent:** Touches absence module + me/leave page only. Depends on W0 (withPersonLock already mirrors the existing ARIA-LOCK in createLeaveRequest; active-gate helper). Does NOT depend on W2 payroll (EOSB-unpaid-leave consumes leave DATA but that wiring is in W2's payroll side, not here) or on workflow internals beyond the already-stable engine. Must run after W0 and can run in parallel with W2 since they share no files.
- **Files likely to change:** modules/absence/actions.ts (submitLeaveRequest: increment pendingDays + recompute closingBalance in outer tx with audit — P2-L1; createLeaveRequest: read isActive+assignmentStatus in loadPersonScope, throw PERSON_INACTIVE — P2-L3; re-run overlap/balance on REJECTED→PENDING — P2-M-resubmit; cross-year balance attribution — P2-M-cross-year; optional drop redundant status UPDATE in decideLeaveRequest — P2-M-decide-double-tx); modules/absence/services.ts (computeClosingBalance reflects non-zero pendingDays; cross-year split helper if chosen); modules/absence/validations.ts + 0006 enum surface (P2-L-RECALLED: remove or implement); app/(employee)/me/leave/page.tsx (total includes carriedForward+adjusted — P2-L4; bilingual STATUS_CONFIG — P2-L-ESS-bilingual).
- **Schema / migration impact:** None required for P2-L1/L3/L4/resubmit/cross-year (pending column already exists; closing_balance CHECK already allows the math). P2-L-RECALLED: if REMOVED, no DB change (CHECK can keep the value harmlessly) or optional migration to tighten enum; if IMPLEMENTED, no schema change either. No data migration.
- **Tests required:** Integration: two sequential pending requests exceeding balance → second blocked (P2-L1); cancel/reject releases reserved pendingDays; approval moves pending→taken with net-zero double-count; HR_ADMIN filing for terminated person (forged id) → PERSON_INACTIVE, active person succeeds (P2-L3); REJECTED request now overlapping an APPROVED one → blocked on re-submit, normal re-submit succeeds (P2-M-resubmit); Dec→Jan request debits both years' rows or pins documented start-year rule (P2-M-cross-year); engine does NOT touch absenceBalances and pending→taken happens exactly once (P2-M-decide-double-tx). Unit: computeClosingBalance with non-zero pendingDays; ESS fixture carriedForward>0 → available<=total + correct label (P2-L4); ESS status chips Arabic under locale=ar (P2-L-ESS-bilingual); leave status set excludes RECALLED if removed.
- **Playwright / manual validation:** Playwright: ESS My Leave shows correct available/total with a carry-forward fixture and Arabic chips under locale=ar; employee files leave, manager approves, balance updates correctly. Manual: file two back-to-back pending requests that together exceed balance and confirm the second is rejected in the UI.
- **Residual-risk checks:** Confirm pendingDays increment and the existing ARIA-LOCK serialize together so concurrent submits cannot both see 0 reserved. Confirm decrement-on-cancel/reject runs for the PENDING→REJECTED path (interaction with P2-M-resubmit). Confirm cross-year rule signed off (UAE practice = per-day-year attribution). Confirm closing_balance can still legitimately go negative only via admin adjustment, not via gate bypass.
- **Definition of done:** Over-commit blocked at the second pending request; terminated-person leave rejected; re-submit re-validates; ESS arithmetic consistent and bilingual; RECALLED resolved; balance ledger transitions exactly once; integration+unit green; 0 TS errors; cross-year business rule recorded.

### W4 — Workflow + timesheet + attendance integrity (self-approval, resolver state, entity-scope, bounds, atomicity)

- **Included finding IDs:** `P2-T3`, `P2-T5`, `P2-T4`, `P2-T2`, `P2-T1`, `P2-M(getPersonSchedule null)`, `P2-M(attendance dup)`, `P2-M(delegate self/cycle)`, `P2-M(exception validation)`, `P2-M(SLA deadline)`, `P2-L(delegate raw text)`, `P2-L(approval bilingual)`, `P2-L(BR-29 delegate)`, `P2-L(resourceLabel)`
- **Why these belong together:** Two tightly-coupled subsystems that meet at the approval engine. The HIGH items anchor the wave: P2-T3 (no self-approval guard — submitter can approve own request) and P2-T5 (attendance write actions have no entity scoping AND attendance_records lacks legal_entity_id). Both are authorization-integrity in the workflow/timesheet domain and reuse W0's assertSameEntity/assertSelfOrTeam. P2-T4 (terminated manager still resolves as approver), P2-T2 (workflow activates with 0 steps or unresolvable CUSTOM_GROUP), P2-M(delegate self/cycle) and P2-L(delegate raw text) all live in lib/workflow-hierarchy.ts + workflow-engine.ts + the approval action-form — the resolver/validation layer — and should be hardened in one pass since they share resolveApprovalChain/takeWorkflowAction. The timesheet/attendance cluster (P2-T1 empty validations + unbounded hours/overtime overflow, getPersonSchedule null→8h + weekend/holiday never computed, attendance duplicate inserts, exception-request validation) all sit in modules/timesheets/actions.ts and share the same calc/insert paths. The approval UI bilingual/BR-29/resourceLabel items are the same approval surface and ride along to avoid a second visit. P2-M(SLA deadline) is downgraded-LOW but lives in the same workflow step validation. Schema rule respected: this wave's ONE schema change (attendance_records.legal_entity_id, P2-T5) is a security-scope column, distinct from W5's MDM uniqueness indexes — but both are timesheet/MDM-adjacent and could be sequenced; kept here because P2-T5 is HIGH and blocks the attendance authorization fix.
- **Why this wave is independent:** Depends on W0 (scope helpers) and the already-stable post-Phase-3 workflow engine. Does not depend on payroll calc (W2) or leave balance (W3) — though weekend/holiday scoring (P2-M getPersonSchedule) and proration (W2) both read schedules, the fixes are in different modules and do not block each other. Self-approval and resolver fixes are internal to workflow; attendance scope is internal to timesheets. Must run after W0; can parallel W5 only if the attendance migration (0056) and W5's schedule migration (0055-series) are sequenced to avoid journal collisions.
- **Files likely to change:** lib/workflow-hierarchy.ts (resolveApprovalChain exclude submitterPersonId — P2-T3; skip !isActive in LINE_MANAGER/POSITION resolvers — P2-T4); lib/workflow-engine.ts (takeWorkflowAction add actorPersonId!==initiatedByPersonId guard — P2-T3; DELEGATE validate active+entity+!==actor — P2-M/P2-L delegate); modules/workflow/actions.ts (createWorkflowStep/updateWorkflowStep require hierarchyGroupId for CUSTOM_GROUP + validate slaHours 1..720; toggleWorkflowActive refuse 0-step/unresolvable — P2-T2, P2-M SLA; createDelegationRule reject self + transitive cycle — P2-M delegate); NEW modules/timesheets/validations.ts (Zod: timeOut>timeIn, hours<=24, overtime<=99.99, attendanceDate, exception allowlist/future/order — P2-T1, P2-M exception); modules/timesheets/actions.ts (clamp/validate before insert; compute isWeekend/isHoliday into deriveStatus; upsert dedup on (person,date,source); entity+direct-report scope on createManualAttendance/approveManualAttendance/reviewExceptionRequest/processExcelUpload — P2-T5); app/(hr-admin)/approvals/[instanceId]/action-form.tsx + StepEditorDrawer.tsx + [instanceId]/page.tsx (bilingual + persistent Delegate button + PersonSelect LOV + resourceLabel map for hiring/transfer/probation/persons); lib/workflow-sla.ts (coerce slaWorkingHours<=0 to default); NEW migrations.
- **Schema / migration impact:** SCHEMA + DATA: migration 0056 — add attendance_records.legal_entity_id (P2-T5; backfill from persons.legalEntityId — requiresDataMigration) and add partial/unique index on (tenant_id,person_id,attendance_date,source) (P2-M attendance dup). Public_holidays read for weekend/holiday scoring (table assumed present; verify). Manual-apply via Neon; sequence after W2's 0055. Rollback: drop column+index. Other items are code-only.
- **Tests required:** Integration: submitter who is entity head → chain excludes self; approve own instance → rejected (P2-T3); inactive line manager → resolver skips to next active (P2-T4); activate 0-step or CUSTOM_GROUP-without-group → blocked, submit against such → friendly error no partial instance (P2-T2); DELEGATE to email/invalid/inactive/self → rejected, valid id → reassigned+notified (P2-M/P2-L delegate); self-delegation + A→B→C→A → blocked (P2-M delegate); MANAGER/HR creating/approving attendance outside reports/entity → FORBIDDEN, SUPER_ADMIN allowed (P2-T5). Unit: reversed punch → explicit error not 0; >99.99h overtime → rejected before insert (no 22003); multi-day span rejected; non-working-day punch → WEEKEND/PUBLIC_HOLIDAY status, OT 0; null schedule → no silent 8h; re-upload Excel/re-enter manual day → single row, summary not doubled; invalid exceptionType/future/reversed → rejected at submit+review; slaHours 0/-5/9999 rejected, calculateDeadlineFromMs(0) not instant-breach. E2E/i18n: all 3 approval buttons visible without interaction; approval panel Arabic under locale=ar; each resourceType shows friendly label.
- **Playwright / manual validation:** Playwright: approval action panel shows Approve/Reject/Delegate persistently (BR-29) and Arabic labels under locale=ar; delegate uses a person picker not raw text. Manual: build a workflow with zero steps and confirm it cannot be activated; punch a weekend day and confirm status WEEKEND with no overtime; attempt cross-entity attendance create via forged payload.
- **Residual-risk checks:** Confirm attendance_records backfill produced no NULL legal_entity_id and matches persons. Confirm public_holidays source exists and is entity/calendar-correct before scoring. Confirm self-approval guard handles top-of-hierarchy (entity head) by escalating, not orphaning. Confirm DELEGATE validation does not break existing in-flight delegations. Confirm timesheet Zod additions don't reject existing valid biometric syncs.
- **Definition of done:** Self-approval impossible; terminated approvers skipped; unresolvable/0-step workflows cannot activate; delegate validated + cycle-safe; attendance entity-scoped with legal_entity_id + dedup index; timesheet hours bounded and weekend/holiday-aware; approval UI bilingual + BR-29 compliant; migration 0056 applied; integration+unit+E2E green; 0 TS errors.

### W5 — MDM / org / schedule integrity — caller-trust, uniqueness, single-default, cycles, transactional audit

- **Included finding IDs:** `P1-H7`, `P1-H9`, `P1-H8b`, `P1-H8a`, `P1-M(multi-isCurrent)`, `P1-H5`, `P1-M(hiring/transfer scope)`, `P1-M(transfer user.id)`, `P1-H6`, `P1-L(disable/enable/correct audit)`, `P1-M(WS MDM tx)`, `P1-H10`, `P1-M(assignmentReason)`, `P1-H1`, `P1-M(head revalidate)`, `P1-M(getDepartmentHead)`, `P1-M(org-tree cycle)`, `P1-M(FK SQL-only)`, `P1-M(scheduleNameAr)`, `P1-L(correctWS)`, `P1-L(org-chart EN)`, `P1-L(revalidatePath)`
- **Why these belong together:** All findings are in the MDM/org/work-schedule domain (DepartmentActions, PositionActions, WorkScheduleActions, work-schedule-assignment-actions, build-tree, foundation/configuration schema). They cluster on four shared mechanics: (1) caller-trust on schedule/entity — P1-H7 (assignWorkSchedule trusts legalEntityId/workScheduleId, HIGH) reuses W0's assertSameEntity + the BDP-009 'use DB entity not caller' pattern, and P1-M(hiring/transfer scope)/P1-M(transfer user.id) are the same caller-trust on positions; (2) DB uniqueness + single-default invariants — P1-H8a scheduleCode unique, P1-H8b/P1-M(multi-isCurrent) single isDefault + single isCurrent (partial unique indexes + in-tx clearing + advisory lock via W0 withPersonLock); (3) cycle prevention — P1-H5 department parent cycle mirrors existing PositionActions detectCircularChain, P1-M(org-tree cycle) is the read-side defense; (4) Hard-Rule-1 transactional audit — P1-H6/P1-L(disable/enable/correct)/P1-M(WS MDM tx) all wrap write+audit in db.transaction using the existing BusinessUnit/Grade pattern. The schedule-source/badge items (P1-H10, P1-M assignmentReason, P1-H9 sync no-op, P1-H1 orphaned dept schedule) are the same schedule subsystem and share the getPersonSchedule/profile derivation. Lower items (FK-SQL-only provisioning, scheduleNameAr nullability, correctWS semantics, org-chart EN label, revalidatePath) are the same files and ride along. Per strict rule, this wave's schema changes are MDM-integrity indexes/columns — kept separate from W7's pure-UI fixes; the org-chart-EN and revalidatePath UI nits are bundled only because they sit inside these same MDM files.
- **Why this wave is independent:** Depends on W0 (assertSameEntity, withPersonLock) and reuses already-existing detectCircularChain/assertCodeUnique patterns from PositionActions/BusinessUnitActions. Does not depend on payroll, leave, or workflow waves. The schedule fixes here (P1-H9 sync, P1-H1 resolution) are the WRITE/MDM side; the timesheet READ side (W4 getPersonSchedule weekend/holiday) is independent and neither blocks the other. Must run after W0; can parallel W2/W3; must sequence its migration slot after W2(0055)/W4(0056) → use 0057.
- **Files likely to change:** modules/core-hr/work-schedule-assignment-actions.ts (P1-H7 re-derive/validate entity+active schedule; P1-H9 check UPDATE rowCount→warn/backfill; P1-M(multi-isCurrent) withPersonLock; P1-L(correctWS) validate+semantics; P1-L(revalidatePath) fix to /persons/[id]); app/(hr-admin)/master-data/work-schedules/components/WorkScheduleActions.ts (P1-H8a assertCodeUnique; P1-H8b clear prior default in-tx; P1-M(WS MDM tx) wrap write+audit); app/(hr-admin)/master-data/departments/components/DepartmentActions.ts (P1-H5 detectCircularChain for parent; P1-H6-analog + P1-L disable/enable/correct in db.transaction; P1-M(head revalidate)); app/(hr-admin)/master-data/positions/components/PositionActions.ts (P1-H6 createPosition transaction); modules/profile/actions.ts + schedule-default.ts (P1-H10/P1-M assignmentReason: derive scheduleSource from id-vs-entity-default not free text); modules/core-hr/department-head.ts (P1-M getDepartmentHead active filter — when consumed); modules/timesheets/actions.ts getPersonSchedule (P1-H1 optional dept fallback — DECISION); lib/org-chart/build-tree.ts (P1-M org-tree visited guard — optional defense); components/org-chart/EmployeeNode.tsx + VacantNode.tsx (P1-L deptNameAr locale render); drizzle/schema/configuration.ts + foundation.ts (indexes/nullability); NEW migration 0057.
- **Schema / migration impact:** SCHEMA: migration 0057 — partial unique indexes: work_schedules(tenant_id,legal_entity_id,schedule_code) (P1-H8a), work_schedules(tenant_id,legal_entity_id) WHERE is_default (P1-H8b), work_schedule_assignments(tenant_id,person_id) WHERE is_current (P1-M multi-isCurrent). DATA: P1-H8b may need a backfill to collapse pre-existing multi-default rows before the index can apply (dry-run required); P1-M(scheduleNameAr) IF made NOT NULL needs AR backfill (requiresDataMigration) — else document nullable. P1-M(FK-SQL-only) is provisioning-only: add a CI guard asserting the FK constraint exists post-migrate; no app change. Manual-apply via Neon, slot 0057. Rollback: drop indexes / revert NOT NULL.
- **Tests required:** Unit/integration: forged assignWorkSchedule with cross-entity/inactive schedule or mismatched legalEntityId → rejected, valid same-entity active → pass (P1-H7); assignWorkSchedule for person with no current worker_assignment → not silent success, getPersonSchedule and getMyProfile agree (P1-H9); two schedules same code same entity → rejected, different entity allowed (P1-H8a); setting second default clears prior (P1-H8b); second isCurrent row rejected by index + advisory lock present (P1-M multi-isCurrent); department A→B then B→A and 3-deep cycle → rejected (P1-H5); MANAGER hiring/transfer for cross-entity position → rejected, transfer to vacant position → error no row (P1-M hiring/transfer scope, transfer user.id); createPosition uses db.transaction with tx audit (P1-H6); disable/enable/correct dept+position wrap mutation+audit in tx (P1-L); HR edit selecting entity default → ENTITY_DEFAULT badge, non-default → EMPLOYEE_OVERRIDE (P1-H10/assignmentReason); seeded position cycle → getOrgTree terminates within clamp no dup (P1-M org-tree); CI: departments_work_schedule_id FK exists post-migrate (P1-M FK); getDepartmentHead returns null/flag for terminated head (P1-M getDepartmentHead); org-chart node shows deptNameAr under locale=ar (P1-L).
- **Playwright / manual validation:** Playwright: department drawer rejects a cycle; work-schedule create rejects duplicate code; org-chart node shows Arabic department name under locale=ar. Manual: forged assignWorkSchedule payload with foreign entity blocked; set two schedules default and confirm only one remains; promote schedule via HR edit and confirm correct badge.
- **Residual-risk checks:** Dry-run P1-H8b/P1-M(multi-isCurrent) backfills against real Neon data for pre-existing duplicate-default / multi-current rows BEFORE applying unique indexes (index creation will fail on existing collisions). Confirm P1-H1 decision (wire dept schedule fallback vs downgrade migration 0054 comment) recorded. Confirm P1-H7 entity re-derivation does not break the honest PersonEditForm path. Confirm detectCircularChain depth cap on departments matches positions. Confirm getDepartmentHead filter only added when a consumer exists (else document).
- **Definition of done:** assignWorkSchedule entity/active-validated and lock-serialized; schedule code + single-default + single-current enforced at DB and app; department/position cycles blocked; hiring/transfer entity-scoped and vacant-transfer rejected; all MDM disable/enable/correct/create wrap write+audit in tx; schedule-source badge derived correctly; org-tree cycle-safe; migration 0057 applied with clean backfill; CI FK guard added; integration+unit green; 0 TS errors.

### W6 — Documents / storage / DataOps write-policy / session-timeout business rules

- **Included finding IDs:** `P3-M(MIME)`, `P3-M(SQL-validator)`, `P3-D3`, `storage-local-in-prod`, `P3-M-DOWNLOAD-SCOPE`, `P3-H3`, `P3-H4`, `P3-M-contractor-bypass`, `P3-M-dependent-double-enrol`, `P3-M-backdate-grace-hardcoded`, `P3-M-OUTBOX-DUP`, `P3-M-LETTERNUM-RACE`, `P3-M(idle-timeout)`, `COMPLIANCE-ENGINE`, `P3-M-profile-audit-bug`
- **Why these belong together:** This wave collects business-rule and hardening fixes that are NOT raw identity-IDOR (those went to W1) but require domain decisions or are self-contained hardening: document-serving security (P3-M MIME nosniff + magic bytes; P3-M-DOWNLOAD-SCOPE entity gate mirroring getLetterDocumentUrl), DataOps write-policy (P3-D3 break-glass: PII encryption/effective-date/main-audit bypass + hard DELETE — a documented-trust DECISION + optional encrypt-on-write/soft-close), SQL-validator allowlist hardening (P3-M SQL-validator — accepted-risk-doc or least-privilege DB role), storage prod-guard (storage-local-in-prod throw on explicit local+uat-temporary). The insurance business rules cluster (P3-H3 premium override unimplemented, P3-H4 auto-plan-change-on-promotion unwired, P3-M-contractor-bypass, P3-M-dependent-double-enrol, P3-M-backdate-grace-hardcoded) all live in modules/insurance/lifecycle.ts and several NEED_BUSINESS_DECISION + the confirmed BR-INS rules in MEMORY — fixed together to honor the documented insurance contract. Race/idempotency hardening (P3-M-OUTBOX-DUP FOR UPDATE SKIP LOCKED, P3-M-LETTERNUM-RACE advisory lock) reuse W0's lock helper. P3-M(idle-timeout) and COMPLIANCE-ENGINE are reconcile-or-implement DECISIONS. P3-M-profile-audit-bug is a self-contained query semantic fix. Grouped last among substantive waves because most items are MEDIUM/LOW and several gate on business decisions rather than blocking go-live.
- **Why this wave is independent:** Each item is localized (document route, dataops route, insurance lifecycle, outbox driver, letter numbering, auth config, profile query). Depends on W0 (lock helper, entity-scope helper for P3-M-DOWNLOAD-SCOPE) and reuses W1's proven entity-gate. Does not depend on payroll/leave/workflow/MDM internals. P3-H4 (wire changePlanTx into promotion) touches employment-actions but only as a best-effort call — does not block W5's MDM fixes. Must run after W0/W1; can be last.
- **Files likely to change:** app/api/documents/[id]/route.ts (X-Content-Type-Options: nosniff + attachment disposition for non-pdf/image — P3-M MIME); modules/core-hr/documents/actions.ts (magic-byte sniff in validateFile; bilingual errors handled in W7 not here); app/api/employee-letters/download/route.ts (entity gate + audit — P3-M-DOWNLOAD-SCOPE); lib/dataops/sql-validator.ts (allowlist/least-privilege/dollar-quote fix OR accepted-risk doc — P3-M SQL-validator); app/api/dataops/{execute,rows,[id]}/route.ts (P3-D3 encrypt-on-write or block known-encrypted columns; soft-close vs hard DELETE; forward to main audit — DECISION); lib/storage/factory.ts (throw on prod+local+uat-temporary — storage-local-in-prod); modules/insurance/lifecycle.ts (P3-H3 override column+logic; P3-H4 changePlanTx call from promotion; P3-M-contractor-bypass move BR-INS-007 to both branches; P3-M-dependent-double-enrol dup guard; P3-M-backdate-grace move to tx with policy settings); modules/core-hr/employment-actions/actions.ts (P3-H4 wire changePlanTx in runGradeChange); lib/jobs/process-driver.ts (P3-M-OUTBOX-DUP claim rows FOR UPDATE SKIP LOCKED / overlap flag); modules/employee-letters/queries.ts (P3-M-LETTERNUM-RACE advisory lock in tx); lib/auth.ts (P3-M idle-timeout DECISION); modules/compliance/* (COMPLIANCE-ENGINE reconcile docs or scope engine); modules/profile/actions.ts (P3-M-profile-audit-bug drop entityId=personId clause); NEW migration 0058 if P3-H3 override column adopted.
- **Schema / migration impact:** SCHEMA (conditional): migration 0058 — P3-H3 IF in scope: add medicalInsuranceEnrolments.employee_premium_override_aed + override_reason (nullable, no data migration). P3-M-OUTBOX-DUP MAY add events.claimed_at column (requiresSchemaChange). P3-D3 hard-DELETE→soft-close is a policy/code change, not schema. All other items code-only. Manual-apply via Neon, slot 0058, sequence after W5(0057). Rollback: drop columns.
- **Tests required:** Security: upload HTML/SVG with image/* MIME → view URL has nosniff/attachment, not rendered as HTML; magic-byte mismatch rejected (P3-M MIME). Integration: HR_ADMIN entity-A downloading entity-B letter → 403, SUPER_ADMIN ok, download audited (P3-M-DOWNLOAD-SCOPE). Validator unit: pg_read_server_files/pg_ls_dir/dblink/current_setting blocked, tagged dollar-quote DROP caught, multi-statement-with-comments rejected (P3-M SQL-validator). DataOps: editing person_bank_details.iban stores ciphertext or is blocked; DELETE on effective-dated HR table rejected/soft-closes; mutation discoverable by main audit (P3-D3). Factory: prod+local+uat-temporary throws or is blocked at serving (storage-local-in-prod). Insurance: enrolEmployee({planId, contractor no exception}) throws BR-INS-007 (P3-M-contractor-bypass); same dependentId twice → CONFLICT no double-count (P3-M-dependent-double-enrol); grace=60 accepts 45-day backdate, =15 rejects 20-day (P3-M-backdate-grace); promotion to plan-changing grade → changePlanTx fires, INSURANCE.PLAN_CHANGED audited (P3-H4); override persisted verbatim not overwritten by splitPremium (P3-H3 if scoped). Concurrency: two pollOutbox over same row dispatch once (P3-M-OUTBOX-DUP); two requestLetter same typeCode → distinct sequential numbers both succeed (P3-M-LETTERNUM-RACE). Profile: activity feed only resourceId-matched rows, no entityId=legalEntityId leak (P3-M-profile-audit-bug). Idle-timeout: if implemented, >15-min idle HIGH_PRIVILEGE rejected.
- **Playwright / manual validation:** Manual: attempt to view a malicious-MIME upload and confirm browser does not execute it; run a DataOps DELETE on an HR table and confirm soft-close/rejection; promote an employee across a plan-gated grade and confirm insurance plan changed. Playwright: HR letter download cross-entity blocked.
- **Residual-risk checks:** Record business DECISIONS before coding: P3-D3 (is DataOps break-glass? if yes document bypass + restrict + alert; if no, add encryption/effective-date), P3-H3 (override in Phase-1 scope?), P3-H4 (auto-plan-change in scope?), P3-M(idle-timeout) (30-min absolute acceptable vs 15-min idle?), COMPLIANCE-ENGINE (decentralized-inline accepted vs build engine?), P3-M SQL-validator (accepted-risk for SUPER_ADMIN vs allowlist). Confirm changePlanTx call is best-effort/non-blocking like termination cancellation. Confirm outbox claim works on single-instance node-cron (not Vercel).
- **Definition of done:** Document serving carries nosniff + magic-byte validation; letter download entity-scoped+audited; DataOps write-policy decision recorded and enforced (encrypt/soft-close or documented break-glass); SQL-validator hardened or risk-accepted; storage prod-guard fails closed; insurance BR-INS contract honored (contractor/dependent/grace/auto-plan-change/override per decisions); outbox + letter-number race-safe; profile feed semantically correct; idle-timeout + compliance-engine decisions recorded; conditional migration 0058 applied; integration+security+unit green; 0 TS errors.

### W7 — UI / bilingual / consistency / defense-in-depth nits

- **Included finding IDs:** `P1-H2`, `P1-L(position)`, `P1-L(status)`, `P1-L(self-mgr)`, `P1-M(dates)`, `P3-L(document-bilingual)`, `P3-L-LETTER-BILINGUAL`, `P3-L-insurance-bilingual`, `P3-L-ARIA-STREAM`
- **Why these belong together:** Pure UI, validation-schema, and bilingual-string fixes with no schema migration and no cross-module data dependency — explicitly separated from the schema-migration waves per the strict rule. The persons-edit cluster (P1-H2 unguarded getPerson → wrap in try/catch+notFound mirroring the profile page; P1-L(position) updatePerson silently no-ops position/dept/grade/location pointers — DECISION whether to wire or remove from patch; P1-L(status) remove INACTIVE SelectItem + tighten enum; P1-L(self-mgr) reject self/cycle line manager; P1-M(dates) cross-field date superRefine — NEEDS_BUSINESS_DECISION on min working age) are all in PersonEditForm/validations/actions and are validation/UI-shape fixes. The bilingual cluster (document/letter/insurance/ESS English-only strings) is the remaining Rule-4 cleanup not already handled inline by earlier waves. P3-L-ARIA-STREAM (mid-stream SSE error not surfaced) is a self-contained UI/route resilience fix. None blocks go-live; all are LOW (a few MEDIUM-shape like P1-L self-mgr).
- **Why this wave is independent:** No schema change, no migration, no dependency on any earlier wave's data fix (though P1-L(status) enum-tighten and P1-L(self-mgr) guard are server-side, they are isolated to the persons validation/action path and do not touch payroll/leave/workflow). Can run fully in parallel once W0 lands; safe to ship last. P1-M(dates) and P1-L(position) carry business decisions that should not block earlier security/correctness work.
- **Files likely to change:** app/(hr-admin)/persons/[id]/edit/page.tsx (P1-H2 wrap getPerson in try/catch→notFound); app/(hr-admin)/persons/[id]/edit/PersonEditForm.tsx (P1-L status remove INACTIVE item; P1-L self-mgr filter dotted-line too); modules/core-hr/actions.ts updatePerson (P1-L position: wire 4 current* pointers + occupancy sync OR remove from patch — DECISION; P1-L self-mgr server guard; delete dead positionChanged var); modules/core-hr/validations.ts (P1-L status tighten assignmentStatus enum + reconcile PENDING_APPROVAL; P1-M dates cross-field superRefine; P1-L self-mgr lineManagerId!==personId); app/(employee)/me/documents + me/letters + me/insurance clients + reports/insurance + signing page (bilingual EN/AR labels — P3-L document/letter/insurance bilingual); modules/core-hr/documents/actions.ts + app/api/documents/[id]/route.ts error strings (bilingual — P3-L document-bilingual); app/api/aria/chat/route.ts (P3-L-ARIA-STREAM terminal SSE error frame).
- **Schema / migration impact:** None. Pure UI/validation/string changes. (P1-L status: reconcile PENDING_APPROVAL vs persons CHECK is a DECISION — if the choice is to ADD it to the CHECK that would be a tiny migration, but the recommended path is to drop it from the enum for persons = code-only.)
- **Tests required:** Server-component: mock getPerson to throw → edit page calls notFound() not propagate (P1-H2). Unit: UpdatePersonSchema rejects assignmentStatus 'INACTIVE' and 'PENDING_APPROVAL' once tightened (P1-L status); updatePerson with lineManagerId===personId and dottedLineManagerId===personId rejected, A→B then B→A rejected (P1-L self-mgr); future DOB / underage / hireDate<DOB / passportExpiry<=issue / visaExpiry<=issue rejected, valid accepted (P1-M dates); IF position pointers wired: updatePerson changes currentPositionId and syncs occupied_by_person_id (P1-L position). i18n/RTL: document access errors contain Arabic; ESS letters + signing page Arabic under locale=ar; ESS insurance badge + reports/insurance Arabic; ARIA stream error after first chunk emits detectable error frame not silent truncation (P3-L-ARIA-STREAM).
- **Playwright / manual validation:** Playwright/i18n: /me/documents, /me/letters, signing page, /me/insurance render Arabic labels under locale=ar; edit form no longer offers Inactive status. Manual: navigate to edit page during a simulated DB fault and confirm graceful notFound; confirm date validation messages on inverted date pairs.
- **Residual-risk checks:** Record DECISION on P1-L(position) (wire pointers vs remove from patch — must not falsely report success) and P1-M(dates) min working age before coding. Confirm P1-H2 try/catch matches the profile-page pattern exactly. Confirm enum tightening doesn't reject any status value the UI legitimately submits. Confirm bilingual additions don't break English-locale rendering.
- **Definition of done:** Edit page fault-safe (notFound); INACTIVE removed + enum tightened; self/cycle manager rejected server-side; date cross-field validation per chosen min-age; position-pointer behavior decided and consistent (no false success); all listed surfaces bilingual EN/AR; ARIA stream surfaces mid-stream errors; unit+i18n+server-component tests green; 0 TS errors; no schema migration introduced.

---

## Deliverable 3 — Top Fix Order

- **Confirmed CRITICAL + HIGH:** 15  (3 CRITICAL, 12 HIGH)
- **Confirmed MEDIUM:** 39  ·  **Confirmed LOW:** 40
- **Rejected (FALSE_POSITIVE):** 4  ·  **Already-fixed / prior-fix-verified:** 15
- **Needs business decision:** 2  (`P2-L2` calendar-day leave, `P2-M-GCC-EOSB` GCC EOSB/GPSSA). Also `P1-H4` uniqueness has a business-decision component.

### Top 10 real issues to fix first (by blast radius)

1. **`P3-A3`** (CRITICAL) — getExpiryAlerts/getComplianceData/getKnowledgeSources/getPeopleStats have no auth/role gate; getExpiryAlerts returns company-wide passport/visa/EID PII
2. **`P2-P1`** (CRITICAL) — WPS SIF generation can never succeed — IBAN/bankCode never populated on payroll_results
3. **`P3-A1`** (CRITICAL) — sendAriaMessage trusts client-supplied sessionCtx (personId/role/legalEntityId) — never re-derived from auth()
4. **`P3-A5`** (HIGH) — requestLetter takes personId from formData and never compares to the caller's own resolved personId
5. **`P2-P3`** (HIGH) — Cross-entity payroll disclosure — getPayrollRunById and run detail page never assert actor entity == run entity
6. **`P2-P4`** (HIGH) — run_number global UNIQUE collides across entities — per-entity MAX + per-entity advisory lock can mint duplicate PR-000001
7. **`P3-A2`** (HIGH) — handleLeaveRequestStatus resolves arbitrary employee by name/number with no role check
8. **`P2-T3`** (HIGH) — No self-approval guard — submitter not excluded from chain; actor==initiator allowed
9. **`P2-T5`** (HIGH) — createManualAttendance/approveManualAttendance no entity scoping; attendance_records has no legal_entity_id
10. **`P2-L1`** (HIGH) — absenceBalances.pendingDays is never incremented — balance gate cannot prevent over-committing concurrent/sequential pending requests

### Recommended first implementation wave

Start with W0 (Foundation). The single highest-leverage observation from reading the code is that the most dangerous findings (P3-A1 ARIA sessionCtx, P3-A3 company-wide PII exposure, P3-A5 ESS letter personId, P3-A2 ARIA cross-person leave, P3-A6/A7 insurance IDOR/entity, P2-P3 payroll entity-scope, P2-T5 attendance scope, P1-H7 schedule entity-trust, P2-L3 terminated-target) all share ONE root cause: server actions/routes trust caller-supplied identity (personId/role/legalEntityId) instead of re-deriving from auth(). The fix infrastructure already exists and is consistent — getCurrentUser() and requireRole() (lib/auth.ts:483/516), a recursive manager-team resolver (lib/leave-person-scope.ts), DbOrTx/Tx (lib/db.ts:61-62), transactional writeAuditLog(tx) (lib/audit.ts:38), encrypt/decrypt (lib/encryption.ts), and pg_advisory_xact_lock already used in createLeaveRequest and payroll. This means W0 is small and surgical (a deriveActorIdentity helper, an assertSameEntity/assertSelfOrTeam scope helper, a withPersonLock/withEntityLock helper, and the DECISION on whether feature_permissions becomes a real requirePermission resolver — P3-D2) rather than a risky rewrite. Landing W0 first turns dozens of W1–W5 fixes into one-line guard calls that all share the same battle-tested, regression-bounded primitives, and the ARIA P3-A1 re-derivation inside W0 doubles as the reference implementation. Without W0, each authorization fix would re-implement the same logic divergently, multiplying review surface and regression risk. After W0 merges green, run W1 (critical authorization + PII) immediately, then W2 (payroll/WPS — legally-mandated and currently 100% non-functional) and W3 (leave balance over-commit) in parallel since they share no files."

### Confirmation

**No code, schema, migration, commit, env, or deployment change was made during this verification.** This markdown report is the only file written. Implementation is **paused** pending explicit approval of the verified plan and a decision on the two `NEEDS_BUSINESS_DECISION` items.
