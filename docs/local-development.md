# Local Development Guide

> **Critical safety rule:** Your `.env.local` `DATABASE_URL` must never point at the Neon production database.  
> If it does, every migration, seed, and Playwright test you run will modify live data.  
>
> **Current state (2026-05-20):** `.env.local` still points at the Neon production database.  
> You must replace `DATABASE_URL` with a safe local URL or approved Test/UAT branch URL before running any write command.

---

## Quick start

```bash
cp .env.local.example .env.local
# Edit .env.local — replace DATABASE_URL with a safe local URL (see below)
pnpm install
pnpm dev
```

---

## Database setup

### Option A — Docker Postgres (recommended)

Zero risk of touching production. Fully isolated local environment.

```bash
docker run --rm -d \
  --name avaniis-dev-db \
  -e POSTGRES_DB=avaniis_hcm_dev \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 \
  postgres:16-alpine
```

Set in `.env.local`:
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/avaniis_hcm_dev
DATABASE_ENV=development
```

The write-safety guard will detect `localhost` and allow all write operations automatically.  
No override flags needed.

### Option B — Neon branch (copy-on-write, free tier)

Creates a full database clone from the production schema and data in seconds.  
Branch writes do not affect production. The branch can be destroyed safely.

```bash
# Install Neon CLI
npm install -g neonctl

neon auth
neon branches create --name my-feature-branch --parent main
neon connection-string my-feature-branch
```

Paste the returned connection string into `.env.local`. You must also configure the
guard so it knows this is a non-production cloud host:

```
DATABASE_URL=postgresql://neondb_owner:<branch-password>@<branch-host>.neon.tech/neondb?sslmode=require
DATABASE_ENV=development
PROD_DATABASE_URL=postgresql://neondb_owner:<prod-password>@<prod-host>.neon.tech/neondb?sslmode=require
ALLOW_NON_PROD_CLOUD_DB_WRITE=true
```

Today the guard runs in `ENV_GOVERNANCE_MODE=single-dev-uat`, so `PROD_DATABASE_URL` is optional until Production exists. When the future Production environment is introduced, switch to `ENV_GOVERNANCE_MODE=uat-prod`; the guard will then require `DATABASE_URL` host != `PROD_DATABASE_URL` host before allowing non-production cloud writes.

---

## Write-safety guard

All dangerous scripts run `scripts/guard-db-write.js` before executing.  
The guard inspects `DATABASE_URL` and `DATABASE_ENV` from `.env.local` and fails closed when `DATABASE_ENV` is missing or unknown.

### Decision tree

```
DATABASE_URL host?
├── DATABASE_ENV missing or unknown
│   └── ⛔  BLOCKED — set DATABASE_ENV explicitly
│
├── DATABASE_ENV=production
│   ├── DB_WRITE_OPERATION=reload|clear|reset → ⛔  BLOCKED
│   ├── ALLOW_PRODUCTION_DB_WRITE=true → ⚠️  SEVERE WARNING + proceed
│   └── otherwise → ⛔  BLOCKED
│
├── Local (localhost / 127.x / docker hostname)
│   └── ✅  ALLOWED — no override needed after DATABASE_ENV is classified
│
├── Cloud host (*.neon.tech, RDS, Supabase, etc.)
│   ├── Host matches PROD_DATABASE_URL host?
│   │   ├── DB_WRITE_OPERATION=reload|clear|reset → ⛔  BLOCKED
│   │   ├── ALLOW_PRODUCTION_DB_WRITE=true → ⚠️  SEVERE WARNING + proceed
│   │   └── otherwise → ⛔  BLOCKED (production host)
│   │
│   ├── ALLOW_NON_PROD_CLOUD_DB_WRITE=true?
│   │   ├── DATABASE_ENV not in [development|dev|test|uat]
│   │   │   └── ⛔  BLOCKED — set DATABASE_ENV correctly
│   │   ├── ENV_GOVERNANCE_MODE=uat-prod and PROD_DATABASE_URL missing or unparseable
│   │   │   └── ⛔  BLOCKED — set PROD_DATABASE_URL for host comparison
│   │   ├── DB_WRITE_OPERATION=reload|clear|reset and DATABASE_ENV not [test|uat]
│   │   │   └── ⛔  BLOCKED — reloads are Test/UAT only
│   │   ├── DB_WRITE_OPERATION=reload|clear|reset and ALLOW_UAT_RELOAD_WRITE not true
│   │   │   └── ⛔  BLOCKED — explicit reload approval required
│   │   └── All conditions met → ⚠️  NON-PROD WARNING + proceed
│   │
│   └── No override → ⛔  BLOCKED (cloud, no approval)
│
└── Unknown host (internal VPN, private network)
    └── ⛔  BLOCKED — add a known host pattern or use local/Test/UAT
```

### Environment variables used by the guard

| Variable | Values | Purpose |
|----------|--------|---------|
| `ENV_GOVERNANCE_MODE` | `single-dev-uat` / `uat-prod` | Current operating model |
| `DATABASE_URL` | any connection string | Target database |
| `DATABASE_ENV` | `development` / `dev` / `test` / `uat` / `production` | Tier classification |
| `PROD_DATABASE_URL` | future production connection string | Host comparison; required in `uat-prod` mode |
| `ALLOW_NON_PROD_CLOUD_DB_WRITE` | `true` / `false` | Unlocks non-production cloud branches |
| `ALLOW_UAT_RELOAD_WRITE` | `true` / `false` | Unlocks approved Test/UAT reload or clear operations |
| `ALLOW_PRODUCTION_DB_WRITE` | `true` / `false` | Unlocks production writes (maintenance only) |

### Important rules

- **`ALLOW_NON_PROD_CLOUD_DB_WRITE=true` is NOT sufficient for production host writes.**  
  If `DATABASE_URL` host matches `PROD_DATABASE_URL` host, only `ALLOW_PRODUCTION_DB_WRITE=true` will unblock generic writes.

- **Today, use `ENV_GOVERNANCE_MODE=single-dev-uat`.**  
  Switch to `ENV_GOVERNANCE_MODE=uat-prod` only after a separate Production database exists.

- **Reload and clear operations are never allowed in production.**  
  Set `DB_WRITE_OPERATION=reload` plus `ALLOW_UAT_RELOAD_WRITE=true` only for an approved Test/UAT reload window.

- **Never commit overrides as `true` in `.env.local`.**  
  Export them as one-off shell variables for the specific command that needs them:
  ```bash
  ALLOW_NON_PROD_CLOUD_DB_WRITE=true pnpm db:migrate
  ```

- **The guard never prints credentials or full URLs.**  
  All output shows only sanitized `hostname:port` and `DATABASE_ENV`.

---

## Safe vs dangerous commands

### Safe — no database writes

```bash
pnpm dev          # Next.js dev server — reads DB at request time, not start
pnpm build        # Next.js build — no DB at build time
pnpm typecheck    # TypeScript type check — no DB
pnpm lint         # ESLint — no DB
pnpm test         # Vitest unit + integration — proxy mocks, zero DB I/O
pnpm test:ui      # Vitest UI — same
pnpm db:generate  # Generates SQL migration files — reads schema, no DB write
pnpm db:studio    # Drizzle Studio — read-only browser; does not modify data
```

### Dangerous — guarded by `scripts/guard-db-write.js`

```bash
pnpm db:migrate       # Applies pending migrations to the database
pnpm db:push          # Pushes schema directly (no journal tracking)
pnpm db:seed          # Runs drizzle/seed.ts
pnpm db:seed:dev      # Runs drizzle/seeds/seed-dev.ts (demo data)
pnpm db:seed:prod     # Runs drizzle/seeds/seed-prod.ts
pnpm db:reset:dev     # migrate + seed:dev — full wipe and reseed
pnpm test:e2e         # Playwright — some tests submit forms that write to DB
```

All guarded scripts exit with an error if the guard blocks.

---

## Configuring for a Neon branch (full example)

```bash
# 1. Create the branch
neon branches create --name feat/my-feature --parent main

# 2. Get the connection string
neon connection-string feat/my-feature
# → postgresql://neondb_owner:abcxyz@ep-new-branch-123456.eu-central-1.aws.neon.tech/neondb?sslmode=require

# 3. Update .env.local
# DATABASE_URL=postgresql://neondb_owner:abcxyz@ep-new-branch-123456...neon.tech/neondb?sslmode=require
# DATABASE_ENV=development
# PROD_DATABASE_URL=postgresql://neondb_owner:prodpass@ep-prod-host.neon.tech/neondb?sslmode=require
# ALLOW_NON_PROD_CLOUD_DB_WRITE=true
# ALLOW_PRODUCTION_DB_WRITE=false

# 4. Apply migrations to the branch
pnpm db:migrate    # guard verifies branch ≠ prod host, then proceeds

# 5. Seed the branch
pnpm db:seed:dev

# 6. When done, delete the branch
neon branches delete feat/my-feature
```

---

## Auth in local development

Microsoft Entra ID SSO does not work locally without Azure AD registration.  
Leave `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `AZURE_AD_TENANT_ID` blank and use demo accounts.

Set `ENABLE_DEV_ACCOUNTS=true` in `.env.local` and sign in at `http://localhost:3000/sign-in`:

| Email | Password | Role |
|-------|----------|------|
| `super.admin@avaniis.dev` | `demo` | SUPER_ADMIN |
| `hr.admin@avaniis.dev` | `demo` | HR_ADMIN |
| `hr.director@avaniis.dev` | `demo` | HR_DIRECTOR |
| `payroll@avaniis.dev` | `demo` | PAYROLL_ADMIN |
| `manager@avaniis.dev` | `demo` | MANAGER |
| `employee@avaniis.dev` | `demo` | EMPLOYEE |
| `finance@avaniis.dev` | `demo` | FINANCE |

**Never enable `ENABLE_DEV_ACCOUNTS=true` in production.**

---

## Migration drift notice (as of 2026-05-20)

The migration journal (`drizzle/migrations/meta/_journal.json`) tracks 25 applied migrations (last: `0026_insurance_currency_settings`).  
Migrations 0027–0039 exist as SQL files on disk but are absent from the journal — they were likely applied via `drizzle-kit push` or manual SQL directly to the production Neon database.

**Do not run `pnpm db:migrate` against Neon without:**
1. A maintenance window and explicit team sign-off.
2. Verifying the migrations are idempotent on a Neon branch first.

---

## Environment variable reference

See [`.env.example`](../.env.example) for a complete documented list of all required variables.
