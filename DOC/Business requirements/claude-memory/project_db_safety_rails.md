---
name: project_db_safety_rails
description: ISSUE-009 fixed — DB write guard added; .env.local still points to Neon until user sets up local DB
metadata: 
  node_type: memory
  type: project
  originSessionId: 00b79cab-90af-4f4b-a2d8-d782a774bdda
---

ISSUE-009 (P0 Safety Blocker) fixed 2026-05-20.

`scripts/guard-db-write.js` blocks all write commands (db:migrate, db:push, db:seed:dev, db:seed, db:reset:dev, test:e2e) when DATABASE_URL points to a cloud/Neon host.

**Why:** `.env.local` DATABASE_URL = Neon production. No staging DB. Any migration, seed, or Playwright test could write to production.

**How to apply:** Override is `ALLOW_PRODUCTION_DB_WRITE=true`. The user still needs to create a local Docker DB or Neon branch and update `.env.local` to complete the isolation — the guard is a safety rail, not a full fix of the underlying env issue.

New files:
- `scripts/guard-db-write.js` — the guard (CJS, reads .env.local via dotenv)
- `.env.local.example` — safe localhost template
- `.env.example` — updated with all variables
- `docs/local-development.md` — setup guide

Still pending: user needs to create a local/staging DB and replace DATABASE_URL in `.env.local` with a non-Neon URL.
