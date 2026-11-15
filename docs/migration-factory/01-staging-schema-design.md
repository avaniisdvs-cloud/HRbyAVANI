# Migration Factory — Staging Schema Design

> **Status:** DESIGN ONLY. No migration file (0055) is created. No database tables are created. No production data is touched. This document defines the *proposed* `migration_*` staging table set for review.
> **Date:** 2026-06-01 (revised post Build Readiness Review)
> **Scope (locked, D1):** Workforce Master + Org Structure + Absence only. Payroll history deferred.
> **Write target (locked, D2):** Isolated staging only. Production tables are never written in this phase.

---

> ## ⚠️ Build Readiness Review Corrections (applied 2026-06-01)
>
> Corrections from the BRR, marked inline with **🔴 CORRECTION**:
> 1. **PII (C2):** `normalized_payload`/`raw_payload` must **encrypt** `emirates_id`/`passport`/`iban` before INSERT (Hard Rule 3 is unconditional) and must be redacted from `audit_log`.
> 2. **Audit (C5):** every staging write is `db.transaction() + writeAuditLog`.
> 3. **Performance (C6):** batch-size cap, `maxDuration`, async/background via cron+outbox, JSONB GIN index, off-peak gate, orphan-batch cleanup cron.
> 4. **Rollback env var (C7):** `DATABASE_URL`, not `POSTGRES_URL`.
> 5. **OD-2 (C8):** locked to **Option A** (enforced intra-set FKs).
> 6. **DataOps boundary (C9)** and **validation thresholds + manual-migration warning (C10)** added.

---

## 1. Design Principles

1. **Isolation first.** Staging tables hold a self-contained working set with **no enforced foreign keys into or out of production tables** → clean `DROP` any time.
2. **Raw + normalized.** Each source row is stored verbatim (`raw_payload`) and parsed (`normalized_payload`). 🔴 **CORRECTION (C2):** PII inside either payload must be encrypted before persist.
3. **Natural keys, not production IDs.** Keyed by source natural key. A production target UUID is recorded only at promotion — never during ingest/validation.
4. **Generic envelope, typed validation.** Single generic row table via a `domain` discriminator + JSONB. Domain rules applied in code.
5. **Standing platform rules apply.** `tenant_id` default + 7 audit columns; **every write via `db.transaction()` + `audit.log()` (C5)**. Effective-date semantics are not needed in staging (disposable working data).
6. **SUPER_ADMIN only — enforced at the request boundary.** 🔴 **CORRECTION (C1/C4):** protection comes from `requireRole(['SUPER_ADMIN'])` on every handler **plus a `middleware.ts` `ROLE_GATED_PATHS` entry** for `/migration-factory` and `/api/migration`. A `feature_permissions` row is **NOT** an enforcement layer (zero runtime consumers) — at most it is display metadata.

---

## 2. Proposed Table Set (4 tables)

All prefixed `migration_`, in a new schema file `drizzle/schema/migration.ts`, exported via `drizzle/schema/index.ts`. 🔴 **CORRECTION (C8):** intra-set FKs are **enforced** (Option A) — see §6.

### 2.1 `migration_batches` — control plane (one row per import)

| Column | Type | Stores |
|---|---|---|
| `id` | uuid PK | Batch identifier |
| `tenant_id` | uuid | Tenant default |
| `source_system` | varchar(40) | `'ORACLE_FUSION'` (extensible) |
| `domain` | varchar(30) | `WORKFORCE_MASTER` \| `ORG_STRUCTURE` \| `ABSENCE` |
| `file_name` | varchar(300) | Original upload filename |
| `file_hash` | varchar(64) | SHA-256 of the upload (dedupe + integrity) |
| `status` | varchar(20) | Batch state (see §3) |
| `row_count` / `valid_count` / `error_count` / `warning_count` | integer | Tallies |
| `expires_at` | timestamptz | 🔴 **NEW (C6):** TTL for orphan/abandoned batch cleanup cron |
| `notes` | text | Operator notes |
| *audit columns* | — | `createdBy`, `createdByName`, `createdDate`, `updatedBy`, `updatedByName`, `lastUpdatedDate` |

### 2.2 `migration_staging_rows` — the working set (one row per source record)

| Column | Type | Stores |
|---|---|---|
| `id` | uuid PK | Staging row identifier |
| `tenant_id` | uuid | Tenant default |
| `batch_id` | uuid **FK → `migration_batches.id`** | Parent batch (enforced intra-set FK, C8) |
| `domain` | varchar(30) | Denormalized domain |
| `source_row_number` | integer | Row position (error reporting) |
| `source_natural_key` | varchar(200) | Source key (Fusion person number / dept code) |
| `raw_payload` | jsonb | Verbatim source row — 🔴 **PII-encrypted (C2)** |
| `normalized_payload` | jsonb | Parsed/typed row — 🔴 **PII-encrypted (C2)** |
| `pii_encrypted` | boolean | 🔴 **NEW (C2):** explicit flag asserting PII fields were encrypted before INSERT |
| `row_status` | varchar(20) | Row state (see §3) |
| `resolved_target_id` | uuid NULL | Production UUID — set **only at promotion**, NULL during ingest/validate |
| `resolved_target_table` | varchar(60) NULL | Target table — set only at promotion |
| *audit columns* | — | as above |

> **Critical isolation rule:** `resolved_target_id` / `resolved_target_table` are **plain columns with NO foreign key** to production. Guarantees a clean `DROP`.
>
> **🔴 CORRECTION (C2 — ✅-verified gap):** `emirates_id`, `passport_number`, `iban`, and any other PII inside `raw_payload`/`normalized_payload` must be encrypted via `lib/encryption.ts` **before INSERT**. Hard Rule 3 ("PII fields = encryption before persist") is **unconditional** — it does not exempt staging. Additionally, the mandated `audit.log()` must **redact** these payloads from `audit_log.new_values` (precedent: FIX-2G-002 redacted SAS URLs). Plaintext PII in staging or in the audit log is a PDPL + Hard Rule 3 regression the moment the first batch lands.

### 2.3 `migration_validation_issues` — validation findings (many per row)

| Column | Type | Stores |
|---|---|---|
| `id` | uuid PK | Issue identifier |
| `tenant_id` | uuid | Tenant default |
| `batch_id` | uuid **FK → `migration_batches.id`** | Parent batch (C8) |
| `staging_row_id` | uuid **FK → `migration_staging_rows.id`** | Parent row (C8) |
| `severity` | varchar(10) | `ERROR` (blocks promotion) \| `WARNING` (advisory) |
| `code` | varchar(60) | e.g. `MISSING_REQUIRED`, `BAD_DATE`, `UNRESOLVED_DEPT`, `DUPLICATE_KEY` |
| `field` | varchar(120) | Offending field path |
| `message_en` / `message_ar` | text | Bilingual message (platform bilingual rule) |
| *audit columns* | — | as above |

### 2.4 `migration_promotion_runs` — promotion governance (defined now, USED LATER)

Defined so the contract is stable; **not exercised** until the separate promotion gate (D5) is approved.

| Column | Type | Stores |
|---|---|---|
| `id` | uuid PK | Promotion run identifier |
| `tenant_id` | uuid | Tenant default |
| `batch_id` | uuid **FK → `migration_batches.id`** | Batch being promoted |
| `mode` | varchar(10) | `DRY_RUN` \| `COMMIT` |
| `status` | varchar(20) | `PENDING` \| `RUNNING` \| `SUCCEEDED` \| `FAILED` \| `ROLLED_BACK` |
| `records_targeted` / `records_promoted` | integer | Counts |
| `started_at` / `finished_at` | timestamptz | Timing |
| `rollback_ref` | varchar(200) | Neon branch/snapshot reference for this promotion |
| `summary` | jsonb | Per-table counts + errors |
| *audit columns* | — | as above |

---

## 3. Validation Lifecycle (state machines)

### Batch status
```
DRAFT ──upload──▶ UPLOADED ──parse──▶ VALIDATING ──┬─ all rows resolved ─▶ VALIDATED
                                                    └─ parse/integrity fail ─▶ FAILED
VALIDATED ──(future promotion gate, D5)──▶ PROMOTING ──┬─▶ PROMOTED
                                                       ├─▶ PARTIALLY_PROMOTED
                                                       └─▶ ROLLED_BACK
[any non-terminal] ──TTL exceeded / timeout──▶ ABANDONED   ◀── 🔴 NEW (C6): cleaned by cron
```

### Row status
```
PENDING ──validate──┬─ no ERROR issues ─▶ VALID
                    └─ ≥1 ERROR issue ──▶ INVALID
VALID ──(future promotion)──┬─▶ PROMOTED
                            └─▶ SKIPPED (operator excluded)
```

### Validation stages (applied in code during VALIDATING)
1. **Structural** — required columns, type/date/enum parse → `MISSING_REQUIRED`, `BAD_DATE`, `BAD_ENUM`.
2. **Intra-batch** — duplicate natural keys, internal reference consistency → `DUPLICATE_KEY`, `UNRESOLVED_DEPT`.
3. **Cross-reference (READ-ONLY against production)** — existence checks. **SELECT-only; never writes production.** 🔴 **CORRECTION (C6/C10):** these reads must run with a **query timeout / circuit breaker** under pool pressure, and the ERROR-vs-WARNING policy must be explicit (C10).
4. **Domain rules** — e.g. absence references a known absence type; assignment has a valid manager natural key.

A batch reaches `VALIDATED` only when `error_count = 0`. WARNING rows are promotable; ERROR rows are not.

> **🔴 CORRECTION (C10):** Cross-reference outcome policy must be defined before build, e.g.: referenced **legal entity / department / position absent in production** → `ERROR` (cannot promote); **cosmetic mismatch** (name spelling) → `WARNING`. Undefined thresholds = an under-specified gate.

---

## 4. Performance & Execution Design *(🔴 NEW section — C6)*

The BRR (✅-verified) found the original design left execution undefined, which undermines the "clean rollback" claim under failure. Required before build:

| Concern | Verified gap | Required design |
|---|---|---|
| Vercel timeout | No `export const maxDuration`; synchronous import → 504 mid-transaction → orphaned `VALIDATING` batch | Ingest API returns **`202 + jobId`** immediately; processing runs in a **background job via the existing `node-cron` + Postgres outbox** pattern; per-route `maxDuration` set |
| Neon pool | `lib/db.ts` `max:1` **only when `NODE_ENV==='production'`** (else pool 10); long ingest serializes other queries in a warm instance, threatening the dashboard `Promise.all` | **Hard batch-size cap (e.g. 500 rows/commit)**, chunked commits, **off-peak gate** for large batches; monitor DB p95 via `/api/health/db`; abort threshold |
| JSONB scale | No index strategy; O(N) validation scans as staging grows | **GIN index** on `normalized_payload` (and btree on `batch_id`, `row_status`, `source_natural_key`) |
| Orphaned batches | No cleanup cron; `vercel.json` has only the SLA cron | **Cleanup cron** moves non-terminal batches past `expires_at` to `ABANDONED` and frees them |
| Concurrency | Two SUPER_ADMIN surfaces (Factory + DataOps) can touch the same rows | Row-locking / advisory lock per batch (**C9**) |

---

## 5. Rollback / Drop Strategy

No inbound FKs from production → clean teardown. With enforced intra-set FKs (C8), drop children first:

```sql
-- Connection via DATABASE_URL  (🔴 corrected from POSTGRES_URL)
DROP TABLE IF EXISTS migration_promotion_runs;
DROP TABLE IF EXISTS migration_validation_issues;
DROP TABLE IF EXISTS migration_staging_rows;
DROP TABLE IF EXISTS migration_batches;
```

- **Data-only rollback** (discard a bad batch): `DELETE FROM migration_* WHERE batch_id = :id` — confined to one batch, no production effect.
- **Full rollback:** drop the 4 tables + revert the `workspace-nav.ts` append (and the deliberate `NAVDEPTH-002` update, C3) + revert Vercel deployment. No production data is affected because none was written.

> **🔴 CORRECTION (C7):** the rollback runbook must be made **executable** (script/CI hook for git tag + Vercel deploy id + Neon branch) and must reference **`DATABASE_URL`**. The 4-role regression validation must be a runnable checklist, not aspirational.

---

## 6. Intra-Set Foreign Keys — DECISION LOCKED (C8)

🔴 **CORRECTION:** OD-2 is no longer "open at build time." **Option A (enforced intra-set FK)** is selected: `migration_staging_rows.batch_id`, `migration_validation_issues.batch_id` / `staging_row_id`, and `migration_promotion_runs.batch_id` are enforced foreign keys **within the `migration_*` namespace only**. This:
- catches orphan bugs early,
- does not compromise production isolation (no FK crosses into production),
- fixes the rollback DROP order deterministically (§5).

---

## 7. How Promotion Will Be Gated Later (D5 — future phase, not this phase)

Promotion (staging → production) is where the real regression risk lives (R4). It must clear its **own** Go/No-Go gate with at least:

1. **Dry-run first** (`mode='DRY_RUN'`) — simulates all writes, reports counts/conflicts, writes nothing.
2. **Transactional + audited** — each promotion inside `db.transaction()` with `audit.log()` (Hard Rule 1); partial failure rolls the batch back.
3. **Effective-date compliant** — production writes use `lib/effective-date.ts` (close + open); never hard updates.
4. **PII encryption** — already encrypted in staging (C2); remains encrypted into production.
5. **Pre-promotion backup** — Neon branch taken before COMMIT; reference in `migration_promotion_runs.rollback_ref`.
6. **Owner approval** — explicit sign-off.

Until that gate is approved, the Factory does **upload → validate → preview** only. No production write occurs.

---

## 8. DataOps Coexistence (🔴 NEW — C9)

The existing SUPER_ADMIN DataOps console can already read/write any table via raw SQL + CRUD, including (once created) `migration_*`. To prevent two SUPER_ADMIN surfaces corrupting a batch mid-validation:
- Acquire a **per-batch advisory lock** (`pg_advisory_xact_lock(hashtext('migration_batch:' || batch_id))`) around validation/state transitions.
- Document that DataOps edits to `migration_*` during an active batch are **unsupported**; operators use the Factory UI for batch lifecycle.

---

## 9. What This Design Does NOT Do (constraints honored)

- ❌ Does not create migration 0055 (design only). *(🔴 C10: when built, 0055 is a manual, un-journalled Neon SQL Editor step — `pnpm drizzle-kit migrate` will NOT create these tables; document loudly.)*
- ❌ Does not create any database table.
- ❌ Does not modify production data.
- ❌ Does not modify existing import logic (`/persons/import`, `import-engine.ts`).
- ❌ Does not change existing navigation behavior.
- ❌ Does not expose anything to HR_ADMIN.
- ❌ Does not touch `admin-nav.ts`.
- ❌ Does not build any UI.
