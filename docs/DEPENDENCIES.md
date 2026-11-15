# DEPENDENCIES.md — Avaniis HR System

## Runtime Dependencies

### Core Framework
| Package | Version | Purpose |
|---------|---------|---------|
| `next` | ^14.2.15 | Full-stack React framework (App Router) |
| `react` / `react-dom` | ^18.3.1 | UI rendering |
| `typescript` | ^5.5.0 | Static typing |

### Authentication
| Package | Version | Purpose |
|---------|---------|---------|
| `next-auth` | ^5.0.0-beta.31 | Auth.js v5 — SSO + session management |
| `@auth/drizzle-adapter` | ^1.4.0 | Auth.js session storage on PostgreSQL via Drizzle |

### Database
| Package | Version | Purpose |
|---------|---------|---------|
| `drizzle-orm` | ^0.30.10 | Type-safe ORM |
| `postgres` | ^3.4.4 | PostgreSQL client (used by Drizzle) |
| `drizzle-kit` | ^0.21.4 | CLI: generate/apply migrations, Drizzle Studio |

### UI Components
| Package | Version | Purpose |
|---------|---------|---------|
| `@radix-ui/react-dialog` | ^1.1.15 | Accessible modal dialogs |
| `@radix-ui/react-dropdown-menu` | ^2.0.6 | Dropdown menus |
| `@radix-ui/react-label` | ^2.1.8 | Accessible form labels |
| `@radix-ui/react-select` | ^2.2.6 | Select dropdowns |
| `@radix-ui/react-slot` | ^1.2.4 | Composable slot primitive |
| `@radix-ui/react-toast` | ^1.2.15 | Toast notifications |
| `@radix-ui/react-tooltip` | ^1.2.8 | Tooltip overlays |
| `lucide-react` | ^0.400.0 | Icon library |
| `class-variance-authority` | ^0.7.0 | Variant-based CSS class utility |
| `clsx` | ^2.1.1 | Conditional className helper |
| `tailwind-merge` | ^2.3.0 | Merge Tailwind classes safely |
| `tailwindcss` | ^3.4.4 | Utility-first CSS framework |

### Internationalisation
| Package | Version | Purpose |
|---------|---------|---------|
| `i18next` | ^23.11.5 | Internationalisation core (EN/AR) |
| `react-i18next` | ^14.1.2 | React bindings for i18next |
| `i18next-resources-to-backend` | ^1.2.1 | Lazy-load translation files |
| `@internationalized/date` | ^3.12.1 | Hijri ↔ Gregorian date calculations |

### Cloud / Storage
| Package | Version | Purpose |
|---------|---------|---------|
| `@azure/storage-blob` | ^12.31.0 | Azure Blob Storage — document vault |

### AI
| Package | Version | Purpose |
|---------|---------|---------|
| `@anthropic-ai/sdk` | ^0.91.1 | Claude API — ARIA AI assistant |

### Utilities
| Package | Version | Purpose |
|---------|---------|---------|
| `date-fns` | ^3.6.0 | Date manipulation |
| `zod` | ^3.23.8 | Schema validation (forms + API) |
| `node-cron` | ^3.0.3 | Background scheduled jobs (doc expiry, SLA breach) |

### Dev / Build Tools
| Package | Version | Purpose |
|---------|---------|---------|
| `vitest` | ^1.6.0 | Unit & integration test runner |
| `@playwright/test` | ^1.44.0 | E2E browser testing |
| `@testing-library/react` | ^16.0.0 | React component testing utilities |
| `tsx` | ^4.15.6 | Run TypeScript scripts (seed, etc.) |
| `autoprefixer` | ^10.4.19 | PostCSS vendor prefix plugin |
| `postcss` | ^8.4.38 | CSS transformation pipeline |
| `dotenv` | ^16.4.5 | .env file loading for scripts |

---

## External Services Required

### Development (local)
| Service | How to run | Notes |
|---------|-----------|-------|
| PostgreSQL 16 | `docker compose up -d` | Runs on `localhost:5433` |

### Production
| Service | Provider | Purpose | Required? |
|---------|----------|---------|----------|
| PostgreSQL | Any managed (Azure DB, Supabase, RDS…) | Primary database | **Yes** |
| Microsoft Entra ID | Azure AD | SSO authentication | Yes (prod) |
| Azure Blob Storage | Azure (UAE North recommended) | Document vault | Yes (prod) |
| Anthropic API | anthropic.com | ARIA AI assistant | Yes (ARIA feature) |
| SMTP / Email service | Any (SendGrid, SES…) | Notification emails | Optional |
| Node.js hosting | Azure App Service, Vercel, etc. | App runtime | **Yes** |

---

## Infrastructure Notes

- **Database port**: Docker exposes PostgreSQL on `5433` (host) → `5432` (container)
  to avoid conflicting with any local Postgres instance.
- **Field encryption**: AES-256-GCM is applied at application layer for sensitive fields
  (bank details). Key stored in `ENCRYPTION_KEY` env var — must be rotated carefully.
- **Cron jobs**: Two background jobs run on a schedule via `node-cron`:
  - `document-expiry-checker` — notifies HR of expiring employee documents
  - `sla-breach-checker` — flags overdue workflow approvals
  These are triggered via protected API routes in production environments.
- **Azure Storage region**: UAE North is the recommended region for data residency
  compliance with UAE regulations.
