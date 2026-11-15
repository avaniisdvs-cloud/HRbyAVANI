# Do Not Break Rules — Architectural Invariants
**Snapshot date:** 2026-06-04

This is a checklist of rules that must not be violated under any circumstances. Each rule has a WHY explanation so you understand what breaks if you ignore it.

Read this before touching existing code. If a proposed change would violate any of these rules, stop and ask the user before proceeding.

---

## 1. Database Rules

- [ ] **Every business write must be inside a `db.transaction()` with `writeAuditLog()` called on the same transaction handle.**

  WHY: If the write commits but the audit write fails, or vice versa, the audit trail is incomplete and the system violates BR-AUDIT-001. The audit log is the compliance record for UAE Labour Law and PDPL. Using the tx handle ensures atomicity — both succeed or both roll back.

  Pattern:
  ```typescript
  await db.transaction(async tx => {
    await tx.insert(persons).values(...)
    await writeAuditLog({ ... }, tx)
  })
  ```

- [ ] **Never use `DELETE` on HR records. Use the effective-date pattern instead.**

  WHY: UAE Labour Law requires a complete, immutable history of employment, salary, and leave decisions. Hard deletes destroy legal evidence. The pattern is: close the current record (set `validTo = today`) and open a new record (insert with `validFrom = today`). See `lib/effective-date.ts`.

  Applies to: persons, worker_assignments, absence_balances, salary_elements, and any record with `valid_from` / `valid_to` columns.

- [ ] **PII fields must be encrypted before persistence using `lib/encryption.ts`.**

  WHY: UAE PDPL (Personal Data Protection Law) and GDPR require that sensitive identity fields cannot be read in plaintext from the database. A DB breach must not expose raw identity data.

  Affected fields: `emirates_id`, `passport_number`, `iban`. Use `encrypt()` / `encryptNullable()` before INSERT/UPDATE, and `decrypt()` / `decryptNullable()` after SELECT.

- [ ] **Every table must include `tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid`.**

  WHY: The system is designed to become multi-tenant. Every row needs a tenant discriminator from day one. Rows without `tenant_id` cannot be isolated when a second tenant is onboarded.

- [ ] **Use `TENANT_ID` from `lib/constants.ts` in every INSERT — never hardcode the UUID.**

  WHY: If the constant changes (e.g. multi-tenant routing), every INSERT changes automatically. Hardcoded UUIDs in 100+ places would require a search-and-replace and would inevitably miss some.

- [ ] **Do not bypass the `guard-db-write.js` safety rail.**

  WHY: This script prevents `drizzle-kit migrate`, `drizzle-kit push`, `db:seed`, and `test:e2e` from running against Neon unless explicitly overridden. Bypassing it risks destroying production data.

---

## 2. RBAC Rules

- [ ] **Every Server Action must call `requireRole(allowed)` as its first statement.**

  WHY: Server Actions are callable from any authenticated client. Without an upfront role check, a lower-privileged user who knows the action name could invoke it. Next.js does not enforce RBAC at the framework level.

  Pattern:
  ```typescript
  export async function updateSalary(input: UpdateSalaryInput) {
    const actor = await requireRole(['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'])
    // ... rest of action
  }
  ```

- [ ] **High-privilege roles (HR_ADMIN, HR_DIRECTOR, SUPER_ADMIN) require MFA.**

  WHY: These roles have access to PII, salary data, and system configuration. SEC-04 mandates MFA step-up. `requireRole()` enforces this automatically via the `mfaVerified` JWT claim. Do not remove or weaken this check.

- [ ] **Never expand a role's access by widening the `allowed` array without user approval.**

  WHY: Role permissions are a business decision, not a technical one. Widening access without approval changes who can see salary data, PII, and audit logs.

- [ ] **Cross-module imports must use the module's `index.ts` barrel, not direct file imports.**

  WHY: Direct imports bypass the intentional public API boundary. If an internal helper changes signature, direct importers break silently. The barrel is the contract. Drizzle schema imports are exempt (they live under `drizzle/schema/` and are referenced directly).

---

## 3. Security Rules

- [ ] **Never log PII, secrets, tokens, or connection strings.**

  WHY: Vercel log drains send logs to external systems (Datadog/Axiom). PII in logs violates PDPL. Secrets in logs are a credential exposure. `lib/logger.ts` redacts 30+ known PII field names — use it instead of `console.log` for structured logging.

- [ ] **Never re-throw errors from Server Action catch blocks using `translateError()`.**

  WHY: Next.js 15 sanitises Server Action exceptions in production builds — the real error message is stripped and replaced with "An error occurred in the Server Components render". The client sees nothing useful. Pattern: catch, `console.error()`, return `{ error: string }`. The client checks `'error' in result`.

- [ ] **CSS tokens only — never raw hex or RGB values in component files.**

  WHY: Raw colour values bypass the design system. They do not respond to dark mode, they break the WCAG contrast audit, and they make theming impossible. Use `var(--accent)`, `var(--ink-1)`, etc. See `07-UI-DESIGN-SYSTEM.md`.

- [ ] **All user-facing strings must be bilingual: `name_en` and `name_ar`.**

  WHY: The system is contractually bilingual. Arabic-locale users see `name_ar`; English-locale users see `name_en`. A string with only one language will appear blank or broken in the other locale. This applies to DB-stored strings, error messages, notifications, and UI labels.

- [ ] **Document storage must use the `lib/storage/` abstraction — never write directly to the filesystem in production.**

  WHY: Vercel serverless functions have a read-only filesystem except `/tmp`. Files written to `/tmp` are lost when the container recycles. The storage abstraction routes to Azure Blob or AWS S3 in production. Setting `DOCUMENT_STORAGE_PROVIDER` to nothing in production throws a clear error rather than silently losing files.

---

## 4. Workflow Rules

- [ ] **Every workflow decision panel must expose exactly three buttons: Approve, Reject, Delegate.**

  WHY: This is BR-29 — the canonical workflow UX. Deviating from it makes the system inconsistent and breaks user training. Do not add extra buttons or remove Delegate.

- [ ] **Workflow writes (instance + steps + notifications + resource updates) must all be in the same database transaction.**

  WHY: If a step record is written but the instance status update fails (or vice versa), the workflow enters an inconsistent state that cannot be recovered automatically. Phase 3 Priority 2 hardened all five workflow write paths to be atomic. Do not revert this to bare `db.insert` / `db.update` calls outside a transaction.

- [ ] **Use `pg_advisory_xact_lock` for per-resource serialisation where overlap checks are race-prone.**

  WHY: Two concurrent leave requests for the same person can both pass the overlap check if they read before either commits. The advisory lock serialises per-person without locking the whole table. Pattern: `hashtext('leave:' || personId)` as the lock key. Already implemented in `createLeaveRequest`. Apply the same pattern for any new resource with a uniqueness-over-time constraint.

- [ ] **The `dispatchResourceCompletion` function must be called with the caller's transaction handle.**

  WHY: Resource completion (updating the hiring_request / transfer_request / leave_request status after workflow approval) must be atomic with the workflow step update. Calling it after the transaction commits creates a window where the workflow is approved but the resource is still PENDING.

---

## 5. UI Rules

- [ ] **Use CSS design system tokens — never raw hex, RGB, or HSL values in component files.**

  Full token list: `var(--bg)`, `var(--surface)`, `var(--card)`, `var(--border)`, `var(--ink-1)` through `var(--ink-4)`, `var(--accent)`, `var(--accent-050)` through `var(--accent-700)`, `var(--nav-bg)`, `var(--nav-fg)`, `var(--nav-active-bg)`, `var(--nav-active-fg)`. Org chart tokens: `--org-acting`, `--org-vacant`, `--org-frozen`, `--org-contractor`, `--org-overloaded`, `--org-under-supervised`.

- [ ] **All UI strings that appear in Arabic locale must have an Arabic counterpart.**

  WHY: The `name_ar` / `subjectAr` / `bodyAr` fields are not optional decoration — they are contractual. Any string without Arabic will appear blank when the user switches to Arabic locale.

- [ ] **The MdmDrawer has a WAI-ARIA focus trap — do not remove it.**

  WHY: CB-BUG-002 was a WCAG 2.1.2 violation. The drawer (`components/mdm/MdmDrawer.tsx`) implements auto-focus on open, Tab/Shift+Tab trapping within the dialog, and focus restoration on close. Removing any of these three hooks breaks keyboard accessibility.

- [ ] **The two navigation config files must stay in sync: `config/workspace-nav.ts` and `config/admin-nav.ts`.**

  WHY: `workspace-nav.ts` controls the HR Admin/Director/Super Admin rail; `admin-nav.ts` controls the Manager sidebar. Adding a new menu item to one without the other means managers never see it (or vice versa). Every navigation change touches both files.

---

## 6. Migration Rules

- [ ] **Never run `pnpm db:migrate` expecting it to apply migrations above 0039.**

  WHY: The Drizzle journal (`drizzle/meta/_journal.json`) tracks only migrations 0000–0039. `drizzle-kit migrate` reads the journal and silently skips unapplied migrations outside it. Migrations 0040–0054 were applied manually via Neon SQL Editor and are not in the journal. Running `db:migrate` on a fresh database will leave it 15 migrations behind the current schema.

- [ ] **Check WIP migration files before creating a new migration.**

  WHY: As of 2026-06-04, files `0055_payroll_run_number_per_entity.sql`, `0055_wip_step_instance_columns.sql`, `0056_wip_notification_queue_meta.sql`, and `0057_wip_audit_immutability.sql` exist in `drizzle/migrations/` but have NOT been applied to any environment. There are also two files starting with `0055_` which creates ambiguity. Always inspect the folder before assigning a slot number.

- [ ] **Apply new manual migrations to a Neon staging/preview branch first, verify, then apply to production.**

  WHY: Migrations applied directly to the production Neon branch cannot be easily rolled back. A mistake in a `NOT NULL` constraint or a missing FK drops the column, locks a table, or causes an immediate production error on next deploy.

- [ ] **Comment-only SQL migrations (e.g. `COMMENT ON TABLE`) are still real migrations and need a slot.**

  WHY: Even though they are zero-risk schema changes, they need a file and a slot number to maintain the migration log and enable future developers to understand the DB history.

---

## 7. Performance Rules

- [ ] **Use `Promise.all()` to parallelise independent DB queries on the same page.**

  WHY: Sequential `await db.select()` calls hold a DB connection per round-trip. On the dashboard page, 6 sequential queries held the connection for ~287ms each. Parallelising with `Promise.all` cut the total to the duration of the slowest query (~82ms). On Neon with a max pool of 5, sequential queries also risk starvation. Pattern: `const [a, b, c] = await Promise.all([query1, query2, query3])`.

- [ ] **The `DATABASE_URL` must point at the Neon pooled endpoint (pgBouncer).**

  WHY: The unpooled endpoint (direct Postgres connection) gives one connection per Vercel function instance. Under concurrency this immediately exhausts Neon's connection limit. The pooled endpoint lets pgBouncer multiplex many function instances over few Postgres connections. The `prepare: false` setting is mandatory with the pooled endpoint.

- [ ] **Never change the Vercel deployment region from `fra1`.**

  WHY: The Vercel function and Neon database are co-located in AWS Frankfurt (eu-central-1). Changing the region adds 80–100ms of DB latency to every request. UAE users already route through Mumbai PoP → Frankfurt function; this adds no meaningful extra latency to users but keeps the DB fast.

- [ ] **Keep `@react-pdf/renderer` in `serverExternalPackages` in `next.config.mjs`.**

  WHY: This package is large (fontkit, pdfkit) and Node-only. Bundling it into the serverless function increases cold start time significantly. `serverExternalPackages` keeps it as a runtime `require()` rather than a webpack bundle.

---

## 8. Code Architecture Rules

- [ ] **Server Actions follow this exact pattern — do not deviate:**

  ```typescript
  export async function myAction(input: unknown) {
    // 1. Auth gate — always first
    const actor = await requireRole(['HR_ADMIN', 'SUPER_ADMIN'])
    // 2. Validate input
    const data = MySchema.parse(input)
    // 3. Business rule comment
    // BR-XX: rule description
    // 4. Write inside transaction with audit
    await db.transaction(async tx => {
      await tx.insert(myTable).values({ ...data, tenantId: TENANT_ID })
      await writeAuditLog({ actorId: actor.id, actorName: actor.name,
        actorRole: actor.role, channel: 'WEB',
        eventType: 'RESOURCE.CREATED', resourceType: 'my_table' }, tx)
    })
    // 5. Revalidate the affected path
    revalidatePath('/relevant-path')
  }
  ```

- [ ] **Never use `translateError()` in a Server Action catch block that returns to a Server Component.**

  WHY: `translateError()` has return type `never` — it always re-throws as an `AppError`. In production Next.js 15, thrown exceptions from Server Actions are sanitised to a generic error message. The client sees nothing. Pattern: catch, `console.error()`, return `{ error: 'Human-readable message' }`.

- [ ] **Cross-module imports must go through the module's `index.ts` barrel.**

  WHY: The barrel is the module's public API. Direct internal imports create hidden coupling — a refactor of an internal helper breaks all direct importers without changing the barrel. Example: `import { getMyProfile } from '@/modules/profile'` (via index.ts), not `import { getMyProfile } from '@/modules/profile/actions'`.

- [ ] **Business rule citations (BR-xx) must appear as inline comments at the point of enforcement.**

  WHY: UAE Labour Law compliance requires traceability from code to legal rule. When an auditor asks "why does this calculation work this way?", the comment tells them which rule applies. Without it, the next developer cannot know whether a change would violate UAE law.
