# SETUP_GUIDE.md — Avaniis HR System

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | ≥ 20 LTS | Use `nvm` or `fnm` |
| pnpm | 9.4.0 | `npm install -g pnpm@9.4.0` |
| Docker Desktop | Latest | For local PostgreSQL |
| Git | Any | |

---

## Step 1 — Clone / Extract

If restoring from this ZIP:
```bash
unzip AVANIIS_HR_complete_backup_20260501.zip -d avaniis-hr
cd avaniis-hr/AVANIIS_HR_SYS
```

---

## Step 2 — Install Dependencies

```bash
pnpm install
```

> All packages are listed in `package.json`. The `pnpm-lock.yaml` lockfile ensures
> reproducible installs.

---

## Step 3 — Set Up Environment Variables

```bash
cp .env.example .env.local
```

Edit `.env.local` and fill in:

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `AUTH_SECRET` | 32-char random string (`openssl rand -hex 16`) | Yes |
| `ENCRYPTION_KEY` | 64 hex chars — AES-256 key (`openssl rand -hex 32`) | Yes |
| `CRON_SECRET` | Random string for cron route auth | Yes |
| `AUTH_MICROSOFT_ENTRA_ID_ID` | Azure App Registration Client ID | Prod only |
| `AUTH_MICROSOFT_ENTRA_ID_SECRET` | Azure App Client Secret | Prod only |
| `AUTH_MICROSOFT_ENTRA_ID_TENANT_ID` | Azure Tenant ID | Prod only |
| `AZURE_STORAGE_ACCOUNT` | Azure Storage account name | Prod only |
| `AZURE_STORAGE_KEY` | Azure Storage account key | Prod only |
| `AZURE_STORAGE_CONTAINER` | Blob container name (default: `avaniis-hr-docs`) | Prod only |
| `NEXT_PUBLIC_APP_URL` | App base URL (e.g. `http://localhost:3000`) | Yes |
| `DEV_ADMIN_EMAIL` | Dev credentials login email | Dev only |
| `DEV_ADMIN_PASSWORD` | Dev credentials login password | Dev only |

For **local development**, the Microsoft Entra and Azure Storage variables can be left
empty. The dev credentials provider (`DEV_ADMIN_EMAIL` / `DEV_ADMIN_PASSWORD`) will be
used instead.

---

## Step 4 — Start PostgreSQL

```bash
docker compose up -d
```

This starts a PostgreSQL 16 container named `avaniis_hr_db` on port **5433**.

Verify it's healthy:
```bash
docker compose ps
```

---

## Step 5 — Run Database Migrations

```bash
pnpm db:migrate
```

This runs all Drizzle migrations in `drizzle/migrations/` in order (0000–0012).

---

## Step 6 — Seed Development Data (Optional)

```bash
pnpm db:seed
```

Creates demo persons, leave types, work schedules, and a default admin user.

---

## Step 7 — Start the Dev Server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

Login with the dev credentials from `.env.local`:
- Email: `admin@avaniis.ae` (or your `DEV_ADMIN_EMAIL`)
- Password: `dev_password_change_me` (or your `DEV_ADMIN_PASSWORD`)

---

## Step 8 — Run Tests

**Unit + integration tests:**
```bash
pnpm test
```

**Interactive test UI:**
```bash
pnpm test:ui
```

**E2E tests (requires running dev server):**
```bash
pnpm test:e2e
```

> Integration tests require a running PostgreSQL with migrated schema.
> Set `DATABASE_URL` in your `.env.local` before running.

---

## Step 9 — Useful Dev Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start Next.js dev server (HMR) |
| `pnpm build` | Production build |
| `pnpm start` | Start production server |
| `pnpm typecheck` | TypeScript type checking (no emit) |
| `pnpm lint` | ESLint |
| `pnpm db:generate` | Generate new Drizzle migration from schema changes |
| `pnpm db:migrate` | Apply pending migrations |
| `pnpm db:seed` | Seed development data |
| `pnpm db:studio` | Open Drizzle Studio (database GUI) |

---

## Production Deployment

1. Set all environment variables (including Entra ID and Azure Storage).
2. Ensure `NODE_ENV=production`.
3. Run `pnpm build` then `pnpm start`.
4. Schedule cron jobs for `/api/cron/document-expiry` and `/api/cron/sla-breach`
   (pass `Authorization: Bearer $CRON_SECRET` header).
5. Configure Microsoft Entra SSO — add `$NEXT_PUBLIC_APP_URL/api/auth/callback/microsoft-entra-id`
   as a redirect URI in your Azure App Registration.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `DATABASE_URL` connection refused | Check Docker is running: `docker compose ps` |
| Port 5433 conflict | Change host port in `docker-compose.yml` |
| `ENCRYPTION_KEY` must be 64 hex chars | Generate with `openssl rand -hex 32` |
| Auth redirect loop | Ensure `NEXT_PUBLIC_APP_URL` matches the browser URL exactly |
| Drizzle migration error | Check Postgres is healthy, then re-run `pnpm db:migrate` |
