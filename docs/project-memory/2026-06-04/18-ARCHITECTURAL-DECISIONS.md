# Architectural Decisions Record (ADR)
**Snapshot date:** 2026-06-04

These decisions were made during Phase 1 design and early sprints. Each entry includes the rationale, what was rejected and why, and a warning for future developers about the cost of changing it.

---

## ADR-001: Neon PostgreSQL + Drizzle ORM

**Decision:** Use Neon serverless PostgreSQL (eu-central-1) as the database and Drizzle ORM as the query builder and migration tool.

**Rationale:**
- Neon provides a serverless-compatible PostgreSQL (auto-suspend, pgBouncer pooling, branch-per-PR) that matches Vercel's serverless function lifecycle. Traditional managed Postgres (RDS, CloudSQL) keeps connections open permanently, which is expensive and incompatible with Vercel's ephemeral function model.
- Drizzle ORM gives full TypeScript type safety on every query result without code generation steps (unlike Prisma). The schema is written as TypeScript and compiled — if a column is removed from the schema, every query that references it becomes a compile error. This is the only ORM that satisfies `strict: true` TypeScript without extensive workarounds.
- Drizzle migrations produce plain SQL files. This gives the team full control over what runs on the database and allows the manual migration pattern needed when the Drizzle journal diverged from production (see ADR-011).

**Rejected alternatives:**
- **Prisma:** Generated client creates a large binary; less flexible raw SQL; schema changes require `prisma generate` step in CI; difficult to use with pgBouncer transaction mode (same `prepare: false` issue, but Prisma's workaround is less stable).
- **TypeORM:** Poor TypeScript inference; decorator-based pattern does not compose well with React Server Components.
- **Plain SQL (pg/postgres.js):** No type safety; schema drift between code and DB is undetectable at compile time.

**Future warning:** Drizzle's migration journal has already diverged from production (see ADR-011). Any future migrations require careful handling. Do not assume `pnpm db:migrate` is safe to run without verifying which migrations are already applied.

---

## ADR-002: Vercel fra1 + Neon eu-central-1 Co-location

**Decision:** Deploy all Vercel functions to `fra1` (Frankfurt) and use Neon's eu-central-1 region.

**Rationale:**
- Vercel fra1 and Neon eu-central-1 both run in the same AWS Frankfurt availability zone. The inter-service DB latency is under 5ms (measured at DB p95=41ms in production soak; the DB query itself accounts for ~36ms of that).
- Without co-location, Vercel→Neon cross-region traffic adds 80–100ms per DB query. Multiplied across 6 parallel dashboard queries, this adds 80–100ms to every page load.
- UAE users route through Vercel's Mumbai PoP (bom1) to the fra1 function. This adds edge CDN latency (~127ms) but keeps the function→DB path fast. The alternative (deploying to a Middle East PoP) has no Neon equivalent and would add 150ms+ of DB latency.
- k6 NFR results: page p95=1,143ms, API p95=294ms, all under threshold. These numbers are only achievable with co-location.

**Rejected alternatives:**
- **me-central-1 (UAE):** Neon does not have a UAE region. Hosting the function in UAE with the DB in Frankfurt would add ~150ms to every query.
- **Supabase (eu-central-1):** Investigated but Supabase's real-time and row-level security features add overhead not needed here; Drizzle integration is less mature.

**Future warning:** Changing `vercel.json` `"regions": ["fra1"]` to any other value will immediately add 80–150ms to every database-backed page. If Neon adds a Middle East region, this decision should be revisited — but measure before moving.

---

## ADR-003: Auth.js v5 JWT Session Strategy (No DB Sessions)

**Decision:** Use JWT sessions (`session: { strategy: 'jwt', maxAge: 1800 }`) rather than database-backed sessions.

**Rationale:**
- DB sessions require a SELECT on every request to validate the session. With 500 concurrent users, this is 500 extra DB queries per page load — a significant bottleneck on a max-5 pgBouncer pool.
- JWT sessions carry all needed claims (role, personId, legalEntityId, mfaVerified) in the signed token. The middleware can enforce routing rules without a DB round-trip.
- 30-minute `maxAge` is the session timeout requirement (NFR-10). This is enforced by JWT expiry without any server-side state.

**Rejected alternatives:**
- **Database sessions:** More revocable (a logout can invalidate the session immediately), but adds a DB query to every request. Acceptable for low-concurrency apps; not acceptable here given NFR-01 (page p95 < 2,000ms with 500 VU).
- **Redis sessions:** Would eliminate the DB query cost, but Redis is explicitly rejected (ADR-001 stack constraints — no Redis in this architecture).

**Tradeoff accepted:** JWT sessions cannot be revoked until expiry. A user whose role is changed in the database will continue to operate with the old role until their 30-minute JWT expires. This is accepted because role changes are rare HR events, not frequent operational changes.

**Future warning:** If immediate session revocation becomes a requirement (e.g. for terminated employees), this decision must be revisited. Options: switch to DB sessions, add a JWT blocklist table (checked in middleware), or reduce `maxAge` to 5 minutes (increases DB load from token refresh).

---

## ADR-004: Microsoft Entra ID as Primary SSO

**Decision:** Use Microsoft Entra ID (formerly Azure AD) as the primary authentication provider via OIDC.

**Rationale:**
- Avaniis is an enterprise Microsoft customer. All employees have Entra ID accounts. Using Entra ID eliminates password management for the application entirely.
- Entra ID Conditional Access policies enforce MFA at the OIDC layer before the AVANIIS HR application ever sees the user. This satisfies SEC-04 (MFA for high-privilege roles) without requiring an in-app TOTP implementation.
- The Avaniis tenant can enforce device compliance, geo-restrictions, and session policies independently of the application.
- Zero password storage for SSO users — `passwordHash` is only populated for SUPER_ADMIN accounts that use the local credentials provider.

**Rejected alternatives:**
- **Google Workspace SSO:** Avaniis uses Microsoft 365, not Google. Employees would need separate Google accounts.
- **SAML 2.0 (direct):** OIDC is simpler to implement with Auth.js; SAML requires XML parsing and is more complex to debug.
- **Custom username/password for all users:** Requires password hashing, reset flows, brute-force protection, and breach monitoring — significant ongoing operational burden for no benefit when Entra ID is available.

**Future warning:** The `AUTH_MICROSOFT_ENTRA_ID_*` env var names follow Auth.js v5's convention. If the Avaniis tenant changes (e.g. renamed or merged), the `issuer` URL and client credentials must all be updated. New SSO users who sign in before they have a `user_accounts` row are provisioned as EMPLOYEE role and a Super Admin notification is sent — this is intentional but means Super Admin must action new-user registrations manually.

---

## ADR-005: Postgres Outbox Pattern for Notifications (No Kafka/Redis)

**Decision:** Use a `notification_log` database table as an outbox for email and in-app notifications, polled by a `node-cron` background process.

**Rationale:**
- The outbox pattern provides at-least-once delivery without requiring a separate message broker. If the notification send fails, the row stays in `PENDING` status and is retried on the next cron tick.
- Postgres is already the system of record. A `notification_log` INSERT inside the same transaction as the business event means the notification is guaranteed to exist if the business event commits.
- `node-cron` running inside the Next.js process avoids the operational complexity of a separate worker service.
- This is sufficient for AVANIIS HR's volume. UAE enterprise HCM for a single group company does not generate Kafka-scale notification throughput.

**Rejected alternatives:**
- **Kafka:** Explicitly rejected (ADR-001). Kafka adds ZooKeeper, broker clusters, consumer groups, schema registry, and significant operational overhead. The throughput requirement does not justify it.
- **Redis (BullMQ/Bull):** Explicitly rejected. Redis adds another infrastructure dependency. An outage in Redis would block all notifications. Postgres is already HA (Neon).
- **AWS SQS/SNS:** Would work technically but adds cloud lock-in and a separate IAM role. The team chose to keep all state in Postgres.

**Future warning:** `node-cron` runs inside the Vercel function, which is stateless and can run multiple instances concurrently. The cron handler uses a dedup check to prevent duplicate notifications (`SELECT WHERE created_date >= now-24h`). If the cron frequency increases or the notification volume grows significantly, the dedup window may need to be tightened and the poller should be moved to a dedicated Vercel Cron function.

---

## ADR-006: Effective-Date Pattern for HR Records (No Hard Deletes)

**Decision:** HR records are never deleted. Changes are represented by closing the current record (`valid_to = today`) and opening a new record (`valid_from = today`).

**Rationale:**
- UAE Labour Law requires employers to maintain complete employment records. A salary that was reduced must remain visible in the audit trail — deleting or overwriting it would destroy legal evidence.
- The effective-date pattern enables point-in-time queries: "what was this employee's salary on 2025-01-01?" This is required for payroll recalculations, dispute resolution, and regulatory audits.
- Immutability is simpler than soft-delete: you never have to remember to filter `WHERE deleted_at IS NULL`. Active records are those where `valid_to IS NULL` or `valid_to > NOW()`.

**Rejected alternatives:**
- **Soft delete (`deleted_at` column):** Does not preserve history — the deleted row has the latest values only, not all intermediate values. A salary history requires multiple rows, not a deletion flag.
- **Event sourcing:** Would also provide a complete history but is significantly more complex to query. Effective-date achieves the same result with standard SQL and Drizzle.

**Future warning:** Every UPDATE to an HR record must follow the close/open pattern or the history is broken. Do not use Drizzle's `.update()` directly on effective-dated tables without first understanding the current `valid_to` state. Use `lib/effective-date.ts` helpers. Failure to follow this pattern breaks point-in-time queries and the leave accrual engine's retroactive calculations.

---

## ADR-007: node-cron + Vercel Cron for Background Jobs

**Decision:** Use `node-cron` for in-process scheduled tasks and Vercel's built-in cron (`vercel.json`) for HTTP-triggered scheduled jobs.

**Rationale:**
- The system needs periodic jobs: workflow SLA checks, probation alerts, outbox poller. These are low-frequency (daily or sub-minute) and low-volume.
- `node-cron` handles the outbox poller (sub-minute) inside the Next.js process. No separate worker infrastructure required.
- Vercel cron handles the daily SLA check by triggering the `/api/cron/workflow-sla` endpoint at 09:00 UTC. This endpoint is protected by `CRON_SECRET`.
- Together these cover all scheduling needs without any external scheduler (no Airflow, no Temporal, no BullMQ).

**Rejected alternatives:**
- **BullMQ (Redis-backed):** Explicitly rejected. Adds Redis dependency. See ADR-005.
- **AWS Lambda scheduled events:** Adds cloud lock-in and cross-service latency. The Vercel cron approach is native to the hosting platform.
- **Temporal:** Powerful but massively over-engineered for this use case. Temporal requires a Temporal server cluster, worker processes, and significant operational overhead.

**Future warning:** Vercel serverless functions can run multiple concurrent instances. If `node-cron` is running in multiple instances simultaneously, each instance will tick independently. The outbox poller and the probation alert cron both have dedup guards, but any new cron jobs must also implement dedup to prevent duplicate processing.

---

## ADR-008: AES-256-GCM Field-Level Encryption for PII

**Decision:** Encrypt `emirates_id`, `passport_number`, and `iban` fields at the application layer using AES-256-GCM before storing them in PostgreSQL.

**Rationale:**
- UAE PDPL (Personal Data Protection Law) and GDPR classify these fields as sensitive personal data. A database breach must not expose them in plaintext.
- Field-level encryption (application-layer) means the database itself holds only ciphertext. Even a full Neon database export does not contain readable PII without the `FIELD_ENCRYPTION_KEY`.
- AES-256-GCM provides authenticated encryption — the `tag` field detects tampering or corruption. A tampered ciphertext throws rather than silently returning garbage data.
- Wire format: `base64(iv[12] || tag[16] || ciphertext)` stored in `VARCHAR(500)`. This is self-contained — no separate IV or tag columns needed.

**Rejected alternatives:**
- **PostgreSQL `pgcrypto`:** DB-level encryption still exposes plaintext to anyone with DB access (the application sends the key with each query). Application-layer encryption means the DB never sees plaintext.
- **Transparent Data Encryption (TDE):** Encrypts the entire DB at rest, but the DB engine itself still processes plaintext. A compromised DB account can read everything. TDE protects against disk theft, not DB account compromise.
- **No encryption (rely on Neon access controls):** Neon access controls are a necessary but not sufficient control. PDPL requires that PII cannot be read in plaintext from the storage medium.

**Future warning:** The `FIELD_ENCRYPTION_KEY` must never be rotated without a migration that re-encrypts all existing ciphertext rows with the new key. Rotating the key without re-encrypting will make all existing encrypted data unreadable. There is currently no key rotation tooling — build it before the first rotation. The zero key (`0`.repeat(64)) is rejected in all environments except `NODE_ENV=development`.

---

## ADR-009: Single-Tenant Architecture with tenant_id Default

**Decision:** Deploy as a single tenant (one Avaniis / AVANIIS Real Estate entity group) but include `tenant_id` on every table from day one, with `DEFAULT '00000000-0000-0000-0000-000000000001'::uuid`.

**Rationale:**
- AVANIIS HR is being built for a single client today but the codebase may be productised for multiple clients in the future.
- Adding `tenant_id` retroactively across 100+ tables is extremely risky (missed tables, data migration complexity, query rewrites). Adding it upfront costs almost nothing — it is a single column per table.
- The `TENANT_ID` constant in `lib/constants.ts` is used in every INSERT. When the system becomes multi-tenant, the constant becomes a function that reads from the session context — no other changes needed in the INSERT code.

**Rejected alternatives:**
- **Single-tenant with no tenant_id:** Cheaper now, very expensive later if productisation is needed. Schema changes across 100+ tables in production is a multi-month project with high risk.
- **Schema-per-tenant:** Different PostgreSQL schema per tenant. Drizzle ORM does not handle dynamic schema names well. Migrations would need to run N times (once per tenant). This approach has no benefits for the current single-tenant deployment.

**Future warning:** Queries currently do not filter by `tenant_id` in most places — the default value makes all rows implicitly the same tenant. When multi-tenancy is enabled, every `SELECT` must add a `WHERE tenant_id = :tenantId` filter. Missing even one is a data leak between tenants. A systematic audit of all queries is required before enabling multi-tenancy.

---

## ADR-010: max:5 Connection Pool on Neon Pooled Endpoint

**Decision:** Use `max: 5` connections in the `postgres.js` client configuration, pointing at the Neon **pooled** (pgBouncer) endpoint, with `prepare: false`.

**Rationale:**
- The original configuration used `max: 1`. This caused a critical production bug: a database transaction holding the single connection blocked every concurrent request until Vercel killed the function (observed as "Saving…" forever on leave submit with status 0).
- The Neon pooled endpoint (pgBouncer in transaction mode) multiplexes many client connections onto few Postgres backend connections. Client-side `max: 5` means each Vercel function instance holds at most 5 connections to pgBouncer. pgBouncer handles the Postgres-level connection limit.
- `prepare: false` is **mandatory** with pgBouncer transaction mode. pgBouncer does not maintain stable sessions between transactions, so PostgreSQL prepared statements (postgres.js default) fail with "prepared statement does not exist". Without this, every query after the first will fail in production.
- `idle_timeout: 20s` releases idle connections quickly, preventing Neon from seeing stale connections from warm-but-idle function instances.

**Rejected alternatives:**
- **max: 1 (original):** Causes request starvation under concurrency. Any in-flight transaction blocks all other requests from that function instance.
- **max: 20+:** Would exhaust pgBouncer's configured backend pool. Neon's free/standard tiers have a backend connection limit. With multiple Vercel function instances each holding 20 connections, the limit is hit quickly.
- **Unpooled endpoint:** Without pgBouncer, each function instance holds a direct Postgres connection. Under Vercel's concurrency model this quickly exhausts Postgres's `max_connections`.

**Future warning:** The `DATABASE_URL` environment variable **must** point at the pooled endpoint (host contains `-pooler`). If someone replaces it with the unpooled endpoint (perhaps copied from the Neon console's "Direct" tab), the `prepare: false` setting becomes unnecessary but the connection limit issue returns immediately. Check the URL format when debugging connection issues.

---

## ADR-011: Migration Journal Gap (0000-0039 Journalled; 0040+ Manual SQL)

**Decision:** Accept that Drizzle's journal covers only migrations 0000–0039. Migrations 0040 and above are applied manually via the Neon SQL Editor and are not tracked by the journal.

**Rationale:**
- The Drizzle journal diverged from production at migration 0040 due to a schema complexity issue where `drizzle-kit generate` created migrations that could not be applied cleanly to the live Neon database in order.
- The team chose to write migration 0040 as raw SQL and apply it directly to Neon, bypassing the journal. This decision was repeated for 0041–0054.
- The manual approach gives full control over what runs on the database (no unexpected Drizzle-generated SQL), allows complex multi-step migrations (e.g. `ALTER TABLE ... ADD COLUMN; UPDATE ...; ALTER TABLE ... ADD NOT NULL`), and avoids the risk of `drizzle-kit migrate` applying a destructive change in production.

**Rejected alternatives:**
- **Reset the journal:** Would require re-applying all 40+ manual migrations to a fresh database and re-testing. This was judged too risky mid-project.
- **Squash all migrations:** Creates a single "initial" migration containing the full schema. This loses history and makes rollback analysis impossible.
- **Continue using `drizzle-kit generate` for 0040+:** Drizzle-generated SQL was producing incorrect migrations for complex schema changes (multi-table FKs, partial indexes). Manual SQL gives precise control.

**Future warning:** There are currently four WIP migration files in `drizzle/migrations/` that are NOT yet applied to any environment: `0055_payroll_run_number_per_entity.sql`, `0055_wip_step_instance_columns.sql`, `0056_wip_notification_queue_meta.sql`, `0057_wip_audit_immutability.sql`. There are also two files with the `0055_` prefix — this must be resolved (rename one to `0055b_` or pick the correct one) before applying either. The next safe new migration slot is **0058**. Always verify by listing `drizzle/migrations/` before creating a new migration.

---

## ADR-012: React Server Components + Server Actions Pattern

**Decision:** Use Next.js 15 App Router's React Server Components (RSC) as the primary rendering model, with Server Actions as the primary mutation mechanism.

**Rationale:**
- Server Components eliminate the client-side data fetching pattern (useEffect + fetch + loading state). Data is fetched at render time on the server, co-located with the component that displays it. No API route required for reading data.
- Server Actions provide a secure, typed RPC mechanism. The action runs on the server; the client sends a POST to a Next.js-generated endpoint. `requireRole()` at the top of every action ensures the auth check happens server-side, not in client-side code that can be bypassed.
- The combination reduces client bundle size significantly: all business logic, DB queries, and auth checks stay on the server. The client only receives the rendered HTML and minimal interactivity.
- Server Actions + `revalidatePath()` replaces manual cache invalidation. After a successful mutation, the affected page is revalidated automatically.

**Rejected alternatives:**
- **Next.js Pages Router with API routes:** The older pattern. API routes are still needed for some cases (document streaming, cron endpoints) but are not the primary mutation mechanism.
- **tRPC:** Type-safe API layer. Considered, but Server Actions achieve the same type safety with less boilerplate and no separate router definition.
- **GraphQL:** Over-engineered for a single-client enterprise HCM. GraphQL's flexibility is a liability when the schema is stable and the client is known.

**Future warning:** Server Action exceptions thrown from Server Components are sanitised by Next.js 15 in production — the error message is replaced with a generic string. **Never use `translateError()` (which always re-throws) in a Server Action catch block.** Always catch, log with `console.error()`, and return `{ error: string }`. The client then checks `'error' in result` and displays the message. This pattern is established throughout the codebase and must be followed for any new Server Action.

---

## ADR-013: @xyflow/react for Org Chart

**Decision:** Use `@xyflow/react` v12.10.2 as the org chart rendering library.

**Rationale:**
- The org chart is a core feature of AVANIIS HR — it displays the full reporting hierarchy, supports hiring and transfer actions from nodes, shows analytics overlays, and exports to PNG/PDF.
- `@xyflow/react` (formerly React Flow) is purpose-built for node-edge graph UIs. It provides drag-and-drop, zoom/pan, custom node types, and edge routing out of the box. Building equivalent functionality from scratch would require months of work.
- The library is mature (v12), actively maintained, and has TypeScript-first APIs. Custom node types (`EmployeeNode`, `VacantNode`) are plain React components with full access to the design system tokens and shadcn/ui primitives.
- The org chart event bus (`lib/org-chart/chart-events.ts`) uses a typed `EventTarget` to decouple the canvas from the ARIA chat panel and the analytics overlay — this is a standard browser API and does not depend on any library-specific feature.

**Rejected alternatives:**
- **D3.js:** Low-level SVG library. Powerful but requires implementing all interaction patterns (zoom, pan, drag, selection) from scratch. Poor React integration (imperative vs. declarative).
- **GoJS:** Commercial license. Complex API. Not open-source.
- **Mermaid.js:** Diagram generation, not an interactive graph. Cannot support click handlers, drag-and-drop, or custom React node components.

**Future warning:** `@xyflow/react` uses an internal canvas coordinate system. Custom nodes receive position props from the library and must not manage their own position state. The `OrgChartCanvas` component re-renders the full node list when the data changes — if the employee count grows beyond ~500 nodes, virtualisation or server-side filtering will be needed. The current implementation renders all nodes on the client and is only tested up to ~100 employees.
