# 🧭 Official ARIA Administration Handbook
### AVANIIS HCM — Single Source of Truth (SSOT)

> **Status:** Authoritative product documentation · **Audience:** Super Admins, HR Admins, Support, Architects, Auditors, future Developers/AI Engineers/Product Owners
> **Scope:** ARIA — the AI Operating Layer of AVANIIS HCM
> **Maintained by:** ARIA Platform Custodian · **Review cadence:** Quarterly
> **Designed to outlive its original authors. Written for a 10-year horizon.**

---

<a id="home"></a>
## 🏠 Home — Interactive Navigation

| # | Chapter | Purpose |
|---|---------|---------|
| — | [Executive Summary](#executive-summary) | One-page orientation for leadership |
| 1 | [ARIA Overview](#ch1) | What ARIA is / is not; business + technical purpose |
| 2 | [ARIA Architecture](#ch2) | Control Plane, Provider Layer, Capability Registry, Governance, System of Record |
| 3 | [Identity Configuration](#ch3) | Agent name, role, persona fields |
| 4 | [Branding Configuration](#ch4) | Tone, persona, design tokens |
| 5 | [AI Model Configuration](#ch5) | Provider, model, keys, temperature, tokens, fallback |
| 6 | [Behaviour & Intelligence](#ch6) | System prompt, authority level, data sources |
| 7 | [Knowledge Base](#ch7) | RAG configuration & governance |
| 8 | [Connection Test](#ch8) | Validating the active provider |
| 9 | [Provider Administration](#ch9) | Configure / switch / failover / onboard providers |
| 10 | [Capability Registry](#ch10) | The capability contract |
| 11 | [Governance & Security](#ch11) | RBAC, workflow, approvals, audit, AI governance |
| 12 | [Operations Guide](#ch12) | Daily / weekly / monthly / quarterly tasks |
| 13 | [Troubleshooting Guide](#ch13) | Symptom → cause → fix |
| 14 | [FAQ](#ch14) | Business, admin, support, developer, architecture |
| 15 | [Future Roadmap](#ch15) | Provider independence, voice, agentic |
| A | [Appendix](#appendix) | Field reference, glossary, SOP index |

**Where ARIA configuration lives:** `Settings → AI Agent` (URL `/settings/ai-agent`, requires **SUPER_ADMIN**).

---

<a id="executive-summary"></a>
## Executive Summary

ARIA is the **AI Operating Layer** of AVANIIS HCM — a provider-independent control plane that lets employees, managers, and HR operate the platform by natural-language intent (English/Arabic, text or voice), while **every consequential action still flows through the platform's own Workflow, RBAC, Audit, and Approval engines.**

Three principles define ARIA and must never be weakened:
1. **The AI model is never the source of truth.** The database and engines are. If every AI provider vanished tomorrow, AVANIIS HCM keeps running.
2. **The AI cannot bypass governance.** ARIA reads, classifies, drafts, and explains. It never approves, executes, routes, or escalates. State changes go through the workflow engine + human confirmation.
3. **The provider is configuration, not code.** Anthropic, OpenAI, Azure OpenAI (and future providers) are selected from configuration via a single abstraction layer (`lib/aria/llm/`). Switching providers requires no business-logic change.

This handbook is the permanent reference for configuring, operating, securing, and evolving ARIA.

[Back to Top](#home)

---

<a id="ch1"></a>
## Chapter 1 — ARIA Overview

### What ARIA Is
**Executive:** ARIA is the conversational and intelligent front door to AVANIIS HCM. Staff ask questions and make requests in plain language; ARIA understands intent and orchestrates the right, governed platform action.

**Technical:** ARIA is a stateless control plane (`modules/aria/`, `lib/aria/`). It performs four functions only — **understand** (intent classification), **orchestrate** (select a governed capability + assemble a draft), **explain/guide** (natural-language responses), **coordinate** (track + notify). It calls an LLM purely as an interpreter behind a provider-neutral boundary.

### What ARIA Is Not
- Not a chatbot, not "an LLM," not OpenAI/Anthropic.
- Not a source of truth.
- Not an approver, executor, privilege-holder, or data owner.
- Not database-aware — it operates through **capabilities**, never raw schema.

### Business Purpose
Reduce friction for self-service (leave, profile, org, policy), give managers fast visibility and approval context, and let HR query workforce data conversationally — without weakening controls or compliance.

### Technical Purpose
Provide a durable, vendor-independent intelligence layer whose permanent assets are the **Capability Contract** and the **deterministic orchestration spine** — not the replaceable model.

### Relationship to the engines
| Engine | ARIA's relationship |
|--------|---------------------|
| **Workflow Engine** (`lib/workflow-engine.ts`) | System of record for transactions. ARIA submits drafts *through* it; never bypasses it. |
| **RBAC Engine** (`lib/auth.ts`) | Every capability is RBAC-gated; identity is re-derived server-side, never trusted from the client. |
| **Audit Engine** (`lib/audit.ts`) | Every ARIA turn writes an INSERT-only `ARIA.QUERY` row in the same transaction. |
| **Approval Engine** | Human approval at the confirmation gate and at every workflow step. AI never approves. |
| **Database** (Drizzle/Neon) | Reached only via governed capability functions, never via ARIA "knowing" tables. |
| **AI Providers** | Pluggable interpreters behind `lib/aria/llm/`. Selected by configuration. |

[Previous](#executive-summary) · [Next: Architecture](#ch2) · [Back to Top](#home)

---

<a id="ch2"></a>
## Chapter 2 — ARIA Architecture

### Request lifecycle
```
User (text / voice, EN / AR)
        │ intent
        ▼
┌──────────────────────────────────────────────────────────────┐
│ ARIA CONTROL PLANE  (modules/aria/, provider-blind)            │
│  understand → orchestrate → explain → coordinate               │
│  + Hard-Rule-7 confirmation gate + audit                       │
└──────┬──────────────────────────────────────────┬─────────────┘
       │ interpret (LLM)                           │ act (capability)
       ▼                                           ▼
┌──────────────────────────┐          ┌────────────────────────────────┐
│ PROVIDER LAYER            │          │ CAPABILITY CONTRACT (Registry)   │
│ lib/aria/llm/             │          │ RBAC-tagged, audited, versioned  │
│  getLlmClient(config)     │          │ getMyManager, getLeaveBalance,   │
│  ├─ anthropic             │          │ draftLeaveRequest, submit…       │
│  ├─ openai                │          └───────────────┬──────────────────┘
│  └─ azure_openai (+future)│                          │ (no bypass)
└───────────────────────────┘                          ▼
   provider = config row          ┌────────────────────────────────────────┐
                                   │ SYSTEM OF RECORD                          │
                                   │ DB · Workflow · RBAC · Audit · Approval   │
                                   └────────────────────────────────────────┘
```

### The five layers
1. **Control Plane** (`modules/aria/services.ts`, `actions.ts`) — intent dispatch, drafting, confirmation, response. Provider-agnostic.
2. **Provider Layer** (`lib/aria/llm/`) — the single AI entry point. `getLlmClient(config)` returns an `LlmAdapter`; adapters translate the neutral contract to each vendor and throw only neutral `LlmError`.
3. **Capability Registry** (`lib/aria/capabilities/registry.ts`) — the contract of what ARIA may do, with RBAC/audit/workflow metadata.
4. **Governance Layer** — RBAC gates, server-side identity (`safeCtx`), audit writes, confirmation gate (Hard Rule 7).
5. **System of Record** — DB + Workflow/RBAC/Audit/Approval engines. The only place state changes.

### Real example — "Who is my manager?"
Intent classified → `ORG_CHART_QUERY` → capability `getMyManager()` (RBAC: self-service, requires person) → deterministic DB read → response card. **No LLM is required to produce the answer** (deterministic), and no write occurs.

### Real example — "Apply annual leave 10–15 July."
Classify → `LEAVE_REQUEST_DRAFT` → `draftLeaveRequest()` builds a validated draft (no write) → user confirms (**Hard Rule 7**) → `submitLeaveRequest()` routes through the **workflow engine** in a `db.transaction` + audit. The model never writes; the engine does.

[Previous](#ch1) · [Next: Identity Configuration](#ch3) · [Back to Top](#home)

---

<a id="ch3"></a>
## Chapter 3 — Identity Configuration

Backed by `ariaAgentConfig`. Configure at **Settings → AI Agent → Identity**.

### Field: `agentName`
- **Purpose:** Display name of the assistant in chat surfaces.
- **Example:** `ARIA`
- **Recommended:** `ARIA` (brand consistency).
- **Business impact:** User-facing identity/trust.
- **Runtime impact:** Injected into the system prompt persona.
- **Dependencies:** Used by `buildAriaSystemPrompt`.
- **Best practice:** Keep stable; avoid frequent changes.
- **Common mistakes:** Changing per-environment, causing user confusion.
- **Screenshot reference:** *[Settings → AI Agent → Identity → Agent Name]*

### Field: `agentRole`
- **Purpose:** One-line role description shaping tone/scope.
- **Example:** `HR Intelligence Assistant`
- **Recommended:** `HR Intelligence Assistant`.
- **Business impact:** Sets user expectations.
- **Runtime impact:** Part of the system prompt.
- **Best practice:** Keep concise (≤6 words).
- **Common mistakes:** Overloading with instructions (use System Prompt instead).
- **Screenshot reference:** *[Settings → AI Agent → Identity → Role]*

### Field: `agentTone`
- **Purpose:** Persona register.
- **Allowed values:** `professional` · `friendly` · `analytical` · `executive` · `strict`.
- **Recommended:** `professional` for HR.
- **Business impact:** Communication style.
- **Runtime impact:** Adjusts prompt phrasing.
- **Best practice:** Match organizational culture; test in both EN and AR.
- **Common mistakes:** `strict` tone perceived as cold in employee self-service.
- **Screenshot reference:** *[Settings → AI Agent → Identity → Tone]*

### Field: `isActive`
- **Purpose:** Marks the active identity record.
- **Best practice:** Exactly one active row.

[Previous](#ch2) · [Next: Branding Configuration](#ch4) · [Back to Top](#home)

---

<a id="ch4"></a>
## Chapter 4 — Branding Configuration

ARIA branding has two parts: **persona branding** (Identity, Ch.3) and **visual branding** (inherited from the AVANIIS design system, not per-ARIA hardcoding).

| Option | Purpose | Impact | Recommendation |
|--------|---------|--------|----------------|
| **Agent name/role/tone** | Conversational brand | Every response | Keep consistent with corporate voice |
| **Bilingual phrasing (EN/AR)** | UAE compliance | All user-facing text | Mandatory — every string EN + AR |
| **Design tokens** (`var(--accent)`, `var(--font-serif)`, etc.) | Visual chrome of chat UI | Widget/menu appearance | Use CSS tokens only; never raw hex |
| **Greeting/quick-replies** | First impression | Engagement | Keep short, action-oriented, bilingual |

**Example greeting (bilingual):** "I can help with your leave balance, leave requests, and finding your line manager. كيف أساعدك؟"

**Best practices:** Brand the persona via Identity; brand the visuals via design tokens; never embed business logic or data in branding text.

[Previous](#ch3) · [Next: AI Model Configuration](#ch5) · [Back to Top](#home)

---

<a id="ch5"></a>
## Chapter 5 — AI Model Configuration

Backed by `ariaModelConfig`. Configure at **Settings → AI Agent → AI Model**. **This is the most consequential chapter — read fully.**

### 5.1 Provider
The active LLM vendor. Selected from configuration; routed by `lib/aria/llm/getLlmClient`.

| Provider | When to use | Pros | Cons |
|----------|-------------|------|------|
| **anthropic** (Claude) | Default & fallback | Strong instruction-following; known-good; current baseline | US data residency |
| **openai** (GPT-4.1) | UAT / cost flexibility; OpenAI credits | Native structured outputs; broad ecosystem | US data residency |
| **azure_openai** | **Production residency** (UAE/EU) | GPT-4.1 quality **+** enterprise DPA + regional hosting | Requires endpoint + deployment naming |
| **Future** (deepseek, gemini, mistral, internal) | As needed | Choice/cost/residency | DeepSeek hosted API **not** approved for production PII — self-host only |

**Recommendation:** Anthropic as default + fallback; **Azure OpenAI** as the production residency target for PII-adjacent traffic; OpenAI direct for UAT.

### 5.2 Model
| Model | Quality | Speed | Cost | Use case |
|-------|---------|-------|------|----------|
| **GPT-4.1** | High | Med | Higher | Response generation, complex intent |
| **GPT-4.1 Mini** | Good | Fast | Low | Intent classification, briefings |
| **Claude Sonnet** (`claude-sonnet-4-6`) | High | Med | Higher | Default response generation |
| **Claude Haiku** (`claude-haiku-4-5`) | Good | Fast | Low | Cheap/fast tasks |

**Best practice:** Route cheap, high-volume calls (classification, daily briefing) to a *mini/haiku* model and quality responses to a flagship.

### 5.3 API Keys
- **Storage:** Encrypted at rest via `lib/encryption.ts` (AES-256-GCM) in `ariaModelConfig.apiKeyEncrypted`.
- **Env fallback:** Provider-aware — `OPENAI_API_KEY`/`AZURE_OPENAI_API_KEY` for OpenAI/Azure, `ARIA_API_KEY`/`ANTHROPIC_API_KEY` for Anthropic.
- **Security:** Keys are masked on read; never logged (added to `lib/logger.ts` redaction).
- **Rotation:** Rotate via admin (re-enter key → re-encrypt). Rotate immediately on suspected exposure; quarterly as policy.

### 5.4 Temperature
Controls randomness/creativity (business language: *how "by-the-book" vs "creative"*).
| Value | Behaviour | Use for |
|-------|-----------|---------|
| **0.0** | Deterministic, repeatable | Classification, compliance phrasing |
| **0.3** | Mostly consistent, slight variation | **Recommended default for HR** |
| **0.7** | Noticeably creative | Brainstorming (rarely needed in HR) |
| **1.0** | Highly variable | Not recommended for HR data |
**Recommended:** `0.3`.

### 5.5 Max Tokens
The maximum length of a single AI response (1 token ≈ ¾ word).
- Too low → truncated answers. Too high → slower + costlier.
- ARIA uses small per-call budgets (classification ~256, formatting ~300, briefing ~200). The config `maxTokens` (default 1000) is the ceiling for free-form replies.
- **Best practice:** Keep modest; ARIA responses are concise cards, not essays.

### 5.6 Fallback Provider
- **Purpose:** Business continuity if the primary provider fails (outage, rate limit, key issue).
- **Failover scenario:** Primary returns `connection`/`rate_limit` → ARIA retries once on `fallbackProvider`/`fallbackModelId` using `fallbackApiKeyEncrypted`.
- **Example:** Primary `openai`/`gpt-4.1`; Fallback `anthropic`/`claude-sonnet-4-6`.

### 5.7 Fallback Model
- **Primary failure:** Use a comparable model on the fallback provider.
- **Automatic recovery (live):** Failover is a single retry on `connection` / `rate_limit` / `timeout` / `not_configured` / `unknown` errors, logged (`fallbackUsed=true`); ARIA returns to primary on the next request. `bad_request` does **not** fail over.
- **Best practice:** Keep a *different vendor* as fallback to survive vendor-wide outages.

### 5.8 API Endpoint (configurable for every provider)
The **API Endpoint** field is editable for **all** providers:
- **Anthropic / OpenAI:** *optional* — leave blank for the provider default (OpenAI → `https://api.openai.com/v1`), or set a custom/OpenAI-compatible base URL or proxy.
- **Azure OpenAI:** *required* — the resource base URL.
- Saved in `ariaModelConfig.apiEndpoint`, loaded into the form, used by the runtime adapter **and** the Connection Test.

### 5.9 How the request URL is built (per provider) — and the two Azure surfaces
The **Provider** you select picks the URL-joining rule in `lib/aria/llm/adapters/`:

| Provider | URL built | Auth header | Model goes in |
|----------|-----------|-------------|---------------|
| `anthropic` | Anthropic SDK (`apiEndpoint` → SDK `baseURL`) | SDK | API call |
| `openai` | `(endpoint or https://api.openai.com/v1) + /chat/completions` | `Authorization: Bearer` | **body** |
| `azure_openai` | `base + /openai/deployments/<model>/chat/completions?api-version=<ver>` | `api-key` | **path** (deployment) |

**Azure exposes two surfaces — pick the matching provider:**
1. **Classic Azure** (`https://<resource>.openai.azure.com` or `…services.ai.azure.com`): deployments path + `api-version` + `api-key` header → select **Azure OpenAI**; Model = **deployment name**; api-version default `2024-10-21`, override by appending `?api-version=YYYY-MM-DD` to the endpoint (Option B — no schema change).
2. **New Azure "v1" (OpenAI-compatible)** (`https://<resource>.openai.azure.com/openai/v1`): `/chat/completions`, **Bearer** auth, `model` in body, no deployments/api-version → select **OpenAI** and paste the **full `/openai/v1` URL** as the endpoint; Model = `gpt-4.1`. This matches Azure's v1 curl/C# samples exactly.

> **Compatibility note:** the adapter sends `max_tokens`. Some newer models on the v1 surface expect `max_completion_tokens`; if a Test returns a 400 about that field, it's a one-line adapter change.

[Previous](#ch4) · [Next: Behaviour & Intelligence](#ch6) · [Back to Top](#home)

---

<a id="ch6"></a>
## Chapter 6 — Behaviour & Intelligence

Backed by `ariaBehaviourConfig`. Configure at **Settings → AI Agent → Behaviour**.

### 6.1 System Prompt (`promptMode` + `systemPromptOverride`)
The system prompt defines ARIA's persona and guardrails. `promptMode` controls how an override combines with the default:
| Mode | Effect | Use when |
|------|--------|----------|
| **prepend** (default) | Override text goes *before* the default | Add emphasis while keeping guardrails |
| **append** | Override goes *after* the default | Add closing instructions |
| **replace** | Override *replaces* the default entirely | ⚠️ Advanced — you assume full responsibility for guardrails |
- **Default Prompt:** Built by `buildAriaSystemPrompt` — forbids inventing company data, restricts to DB/policy sources.
- **Custom Prompt examples:** *prepend* "Always greet bilingually."; *replace* only for expert operators after review.
- **Best practice:** Prefer `prepend`/`append`. Never put business rules or data in the prompt.

### 6.2 Authority Level (`authorityLevel`)
| Level | Meaning | Business impact | Security |
|-------|---------|-----------------|----------|
| **advisory** (default) | ARIA informs and drafts only | Safest; human does everything consequential | ✅ Recommended |
| **recommend_approve** | ARIA may surface recommendations on approvals | Faster decisions; human still approves | Use with manager training |
| **full_execution** | (Reserved) autonomous execution | High | ⚠️ **Not enabled** — has no governed execution path yet; keep OFF |
**Recommended:** `advisory`. Do not enable `full_execution` until it has a gated, audited, workflow-routed path.

### 6.3 Data Sources (`enabledDataSources`)
| Source | What ARIA can read | Risk | Best practice |
|--------|--------------------|------|---------------|
| `hr` | Org/person/department reads | Low (RBAC-gated) | Keep on |
| `absence` | Leave balances/requests | Low (self-scoped) | Keep on |
| `compliance` | Emiratisation/expiry metrics | Medium (admin-only) | On for HR/admin |
- **How ARIA uses them:** Enables the matching capabilities/intents; disabled sources return graceful "not available" messages.
- **Risks:** Enabling sources beyond a role's need — mitigated because capability RBAC still gates each call.

### 6.4 Other intelligence toggles
`ragEnabled`, `ragMaxChunks` (Knowledge Base — Ch.7), `anomalyDetection`, `predictiveInsights`, `slaMonitoring` — feature flags for advanced analytics; enable progressively after validation.

[Previous](#ch5) · [Next: Knowledge Base](#ch7) · [Back to Top](#home)

---

<a id="ch7"></a>
## Chapter 7 — Knowledge Base

- **Purpose:** Provide ARIA read-only policy/document context (RAG) so it can *explain* policy in plain language — **never to enforce policy** (enforcement stays in the rules engine).
- **Configuration:** `ragEnabled` (on/off), `ragMaxChunks` (how many retrieved snippets, default 5).
- **Governance:** RAG is **read-only** and used for explanation only. It must never become a source of authoritative HR data or override the database.
- **Maintenance:** Keep source documents current; remove outdated policy versions; version-control policy text.
- **Best practices:** Curate a small, high-quality corpus; prefer official HR policy documents; review quarterly.
- **Example:** "What is the annual leave policy?" → ARIA retrieves the policy text and explains it; it does **not** compute a specific employee's entitlement from RAG (that comes from `getLeaveBalance()`).

[Previous](#ch6) · [Next: Connection Test](#ch8) · [Back to Top](#home)

---

<a id="ch8"></a>
## Chapter 8 — Connection Test

Run at **Settings → AI Agent → Test Connection** (`testAriaConnection`, SUPER_ADMIN).

- **Pre-flight validation (before the live call):** the tab shows exactly what it will use — `provider → endpoint · api-version` — and validates it: Azure OpenAI **requires** an endpoint; any endpoint must be a valid `https://` URL; non-standard Azure hosts are flagged ⚠ (still testable). The **Test button is disabled** on invalid config and fails fast with a clear message instead of an opaque provider error. The same checks are enforced server-side in `testAriaConnection` (defense in depth).
- **What is tested:** A minimal live call to the **currently configured provider** (provider-aware dispatch), validating key/endpoint/model reachability and measuring latency.
- **Displayed summary:** Provider · Model / Deployment · Endpoint · API Version · Temperature · Max Tokens (refreshes after a save).
- **Expected result:** `success: true` with a latency in ms.
- **Failure scenarios & meaning:**
  | Result | Likely cause |
  |--------|--------------|
  | "No API key configured" | Missing key in config and env |
  | "Failed to decrypt API key" | Corrupt/rotated encryption key |
  | `auth` / 401 | Wrong/expired API key |
  | `rate_limit` / 429 | Quota exhausted |
  | `connection` | Network/endpoint unreachable (check Azure endpoint) |
  | 400 "credit balance too low" | Provider account unfunded |
- **Troubleshooting steps:** Verify provider/model/key; re-enter key; confirm credits; for Azure verify endpoint + deployment name + api-version; re-run test.

[Previous](#ch7) · [Next: Provider Administration](#ch9) · [Back to Top](#home)

---

<a id="ch9"></a>
## Chapter 9 — Provider Administration

### Configure Anthropic (default)
1. Provider → `anthropic`; Model → `claude-sonnet-4-6`.
2. API Key → Anthropic key (or env `ARIA_API_KEY`/`ANTHROPIC_API_KEY`).
3. Save → Test Connection.

### Configure OpenAI (GPT-4.1 — UAT)
1. Provider → `openai`; Model → `gpt-4.1` (or `gpt-4.1-mini`).
2. API Endpoint → *optional* (blank → `https://api.openai.com/v1`).
3. API Key → OpenAI key (or env `OPENAI_API_KEY`).
4. Save → Test Connection.

### Configure Azure OpenAI — **two surfaces, pick the right one**
**A. Classic Azure (deployments + api-version):**
1. Provider → `azure_openai`; Model → the **deployment name**.
2. API Endpoint → resource base, e.g. `https://<resource>.openai.azure.com` (or `…services.ai.azure.com`).
3. API Key → Azure key. 4. Save → Test Connection.
   - The adapter builds `…/openai/deployments/<deployment>/chat/completions?api-version=2024-10-21` with the `api-key` header. Override api-version by appending `?api-version=YYYY-MM-DD` to the endpoint.

**B. New Azure "v1" (OpenAI-compatible — matches Azure's v1 curl/C# samples):**
1. Provider → **`openai`** (not azure_openai).
2. API Endpoint → the **full v1 base**, e.g. `https://<resource>.openai.azure.com/openai/v1`.
3. Model → `gpt-4.1`. 4. API Key → Azure key. 5. Save → Test Connection.
   - The adapter builds `…/openai/v1/chat/completions` with `Authorization: Bearer` and `model` in the body — identical to the v1 sample.
   - If a Test returns a 400 about `max_tokens` vs `max_completion_tokens`, that's the one known v1 field difference (one-line adapter change).

### Switch providers
Change the active `ariaModelConfig.provider`/`modelId` (+ key) and Save. **No code change, no redeploy.** Effective on the next ARIA request.

### How fallback / failover works
On a primary `connection`/`rate_limit` error, ARIA retries once on the configured fallback provider/model. The event is audited (`fallbackUsed`). Recovery to primary is automatic next request.

### Onboarding a future provider
Engineering adds one adapter file under `lib/aria/llm/adapters/` and registers it in `ADAPTER_REGISTRY` (one line). Admins then select it from configuration. No business-logic, RBAC, workflow, or audit change.

[Previous](#ch8) · [Next: Capability Registry](#ch10) · [Back to Top](#home)

---

<a id="ch10"></a>
## Chapter 10 — Capability Registry

### What a capability is
A named, versioned, governed function ARIA may invoke — carrying its **RBAC scope, input/output schema, audit requirement, and workflow requirement**. Defined in `lib/aria/capabilities/registry.ts`.

### Why capabilities (not schema)
ARIA must **never** know the database structure. It knows *what it can ask for*, not *how data is stored*. This prevents schema leakage, blocks model-shaped queries, and means schema changes never affect ARIA. (Bad: "query worker_assignments". Good: `getMyManager()`.)

### The registered capabilities
| Capability | Intent | Kind | RBAC | Workflow | Audit |
|------------|--------|------|------|----------|-------|
| `getMyManager()` | ORG_CHART_QUERY | read | self-service, requires person | no | yes |
| `getLeaveBalance()` | LEAVE_BALANCE_QUERY | read | self-service | no | yes |
| `getLeaveRequestStatus()` | LEAVE_REQUEST_STATUS | read | self-service | no | yes |
| `draftLeaveRequest()` | LEAVE_REQUEST_DRAFT | draft | self-service | no (draft only) | yes |
| `submitLeaveRequest()` | LEAVE_REQUEST_CONFIRM | **write** | self-service | **yes** | yes |
| `listDepartments()` | DEPARTMENT_QUERY | read | any auth | no | yes |
| `getHeadcount()` | HEADCOUNT_QUERY | read | any auth | no | yes |
| `getCompliance()` | COMPLIANCE_QUERY | read | HR/admin roles | no | yes |
| `getWorkflows()` | WORKFLOW_QUERY | read | manager+ | no | yes |
| `getTeam()` | TEAM_QUERY | read | manager+ | no | yes |
| `getPolicy()` | POLICY_QUERY | read | any auth | no | yes |

**Rule encoded in code & tests:** only `write` capabilities set `workflowRequired: true`; reads never do. `submitLeaveRequest` is the sole state-changing capability and is workflow + audit gated.

[Previous](#ch9) · [Next: Governance & Security](#ch11) · [Back to Top](#home)

---

<a id="ch11"></a>
## Chapter 11 — Governance & Security

### RBAC
Every capability is role-gated; ARIA re-derives `personId/role/legalEntityId` from the **session** server-side (`safeCtx`) and ignores client-supplied identity. A forged context cannot read another employee's data or escalate.

### Workflow
All state changes route through `lib/workflow-engine.ts` inside a `db.transaction` + advisory lock — the same path the human UI uses. ARIA cannot bypass it (no tool ever writes directly).

### Approvals
Human approval is required at the **confirmation gate** (Hard Rule 7) and at **every workflow step**. AI never approves, overrides, or reroutes.

### Audit
Every ARIA turn writes an INSERT-only `ARIA.QUERY` row in the same transaction (`lib/audit.ts`). Recommended enrichment: `provider`, `modelId`, token counts, `fallbackUsed`.

### Provider Security
Keys encrypted at rest; masked on read; redacted from logs. Prefer Azure OpenAI (UAE/EU) for PII-adjacent traffic with a signed DPA + zero-retention terms.

### Data Privacy
No decrypted PII (Emirates ID, passport, IBAN, salary) is placed into prompts. User message + recent history are sent to the provider — choose a region/DPA accordingly.

### AI Governance (mandatory rules)
1. AI is never the source of truth.
2. AI may read/draft/explain; never approve/execute/route/escalate.
3. Business logic lives in code/workflows/rules — never in prompts or model memory.
4. The provider is configuration; no business logic depends on a vendor SDK.
5. `full_execution` stays disabled until governed.

[Previous](#ch10) · [Next: Operations Guide](#ch12) · [Back to Top](#home)

---

<a id="ch12"></a>
## Chapter 12 — Operations Guide

| Cadence | Tasks |
|---------|-------|
| **Daily** | Check ARIA health (Connection Test green); scan error logs for `[ARIA]` provider errors; confirm fallback not chronically firing. |
| **Weekly** | Review token usage/cost trend; review sample conversations for response quality; verify audit rows are being written. |
| **Monthly** | Reconcile provider spend vs budget; review RBAC/capability access logs; confirm key validity. |
| **Quarterly** | Rotate API keys; review this handbook; review provider DPA/residency; review authority level; re-validate after model version updates. |
| **Provider monitoring** | Watch latency + error-kind distribution per provider; alert on `rate_limit`/`connection` spikes. |
| **Cost monitoring** | Track tokens by purpose; route cheap calls to mini/haiku. |
| **Performance monitoring** | Track end-to-end response time; investigate >3s. |
| **AI health checks** | Scheduled Connection Test; synthetic "Who is my manager?" probe (deterministic) to confirm pipeline. |

[Previous](#ch11) · [Next: Troubleshooting](#ch13) · [Back to Top](#home)

---

<a id="ch13"></a>
## Chapter 13 — Troubleshooting Guide

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| **Agent name not updating** | Multiple/inactive identity rows; cache | Ensure one `isActive` identity row; reload config |
| **Provider not connecting** | Wrong key/endpoint; no credits | Verify provider/model/key; Azure endpoint+deployment; check credits; Test Connection |
| **API key issues** | Expired/rotated/undecryptable | Re-enter key (re-encrypts); rotate; verify encryption key intact |
| **Fallback keeps activating** | Primary outage/quota | Check primary provider status + credits; confirm fallback config correct |
| **Knowledge Base issues** | RAG off; stale corpus | Enable `ragEnabled`; refresh documents; check `ragMaxChunks` |
| **Response quality issues** | Wrong model/temperature; replace-mode prompt missing guardrails | Use flagship model; temperature 0.3; revert to prepend/append prompt |
| **Model selection issues** | Model id mismatch (esp. Azure deployment name) | Match model id to provider; for Azure use the deployment name |
| **Performance issues** | Large max tokens; flagship for cheap calls | Lower max tokens; route classification to mini/haiku |
| **Generic "having trouble" message** | Unhandled provider error | Check server logs for `[ARIA]` line + `LlmError.kind`; the real cause is logged (never shown to user) |

[Previous](#ch12) · [Next: FAQ](#ch14) · [Back to Top](#home)

---

<a id="ch14"></a>
## Chapter 14 — Frequently Asked Questions

**Business**
- *Can ARIA approve leave?* No. ARIA drafts; humans approve via the workflow engine.
- *Is our data safe?* RBAC-gated, audited, no PII in prompts; choose Azure region + DPA for residency.

**Administrator**
- *How do I switch to GPT-4.1?* Set provider/model/key in Settings → AI Agent → AI Model; Test Connection. No deploy.
- *How do I make ARIA more concise?* Lower max tokens; use prepend prompt guidance.

**Support**
- *User sees "ARIA is having trouble"?* Check `[ARIA]` server logs for the real `LlmError.kind`; usually provider key/credit.
- *Manager lookup fails for a pilot user?* Likely no `lineManagerId` linked → "could not find a manager"; this is a data task, not a bug.

**Developer**
- *Where do I add a provider?* One adapter in `lib/aria/llm/adapters/` + register in `ADAPTER_REGISTRY`. Never call a vendor SDK outside an adapter.
- *Where is business logic?* In `modules/aria/` + the engines — never in prompts.

**Architecture**
- *What is the permanent asset?* The Capability Contract + deterministic orchestration spine. Models are replaceable infrastructure.
- *Can ARIA bypass the workflow engine?* No — it has no write path; only `submitLeaveRequest` reaches the engine, after human confirmation.

[Previous](#ch13) · [Next: Future Roadmap](#ch15) · [Back to Top](#home)

---

<a id="ch15"></a>
## Chapter 15 — Future Roadmap

- **Provider Independence (✅ shipped):** `lib/aria/llm/` with Anthropic, OpenAI, Azure adapters; config-driven switching + fallback.
- **Capability Registry (✅ initiated):** governed contract live; next, drive dispatch + RBAC checks directly from the registry.
- **AI Control Plane (in progress):** per-purpose model routing (classification vs response vs knowledge), token budgets, richer telemetry in audit.
- **Voice Integration (roadmap):** today client-side Web Speech feeds the text path; next, server STT (Azure Speech / `gpt-4o-transcribe`) behind the same adapter; then optional TTS.
- **Agentic Operations (future, gated):** multi-step plan→tool→observe loops behind `authorityLevel`, provider-agnostic, still bounded by confirmation + workflow + audit.
- **Future Provider Onboarding:** DeepSeek (self-hosted only for PII), Gemini, Mistral, internal models — each a single adapter + config option.

[Previous](#ch14) · [Next: Appendix](#appendix) · [Back to Top](#home)

---

<a id="appendix"></a>
## Appendix

### A. Configuration field reference (source of truth: DB tables)
- **`ariaAgentConfig`** — `agentName`, `agentRole`, `agentTone`, `isActive`
- **`ariaModelConfig`** — `provider`, `modelId`, `apiKeyEncrypted`, `apiEndpoint`, `temperature`, `maxTokens`, `fallbackProvider`, `fallbackModelId`, `fallbackApiKeyEncrypted`, `isActive`
- **`ariaBehaviourConfig`** — `authorityLevel`, `promptMode`, `systemPromptOverride`, `enabledDataSources`, `ragEnabled`, `ragMaxChunks`, `anomalyDetection`, `predictiveInsights`, `slaMonitoring`, `isActive`

### B. Glossary
- **Control Plane** — ARIA's provider-blind orchestration logic.
- **Provider Layer** — `lib/aria/llm/`; the single AI entry point.
- **Capability** — a governed function ARIA may invoke.
- **System of Record** — DB + Workflow/RBAC/Audit/Approval engines.
- **LlmError** — provider-neutral error taxonomy (`rate_limit|connection|auth|bad_request|not_configured|timeout|unknown`).
- **Hard Rule 7** — explicit human confirmation before any submission.

### C. SOP index
1. **Configuration SOP** — Ch.3–7, Ch.9 (set identity → model → behaviour → test).
2. **Operations SOP** — Ch.12 (daily→quarterly cadence).
3. **Governance SOP** — Ch.11 (mandatory rules + RBAC/workflow/audit).
4. **Troubleshooting SOP** — Ch.13 (symptom → cause → fix).

### D. Key source locations (for future developers)
- `lib/aria/llm/` — provider layer · `lib/aria/capabilities/registry.ts` — capability contract
- `lib/aria/config-loader.ts` — runtime config · `modules/aria/services.ts` + `actions.ts` — control plane
- `lib/workflow-engine.ts` · `lib/auth.ts` · `lib/audit.ts` · `lib/encryption.ts` — engines

[Previous](#ch15) · [Back to Top](#home)

---
*End of the Official ARIA Administration Handbook. Treat as the SSOT; update via change-controlled review each quarter.*
