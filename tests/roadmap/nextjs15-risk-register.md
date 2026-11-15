# AVANIIS HCM — Next.js 15 Migration Risk Register
## Phase 2 Roadmap Task 1 — Risk Classification & Compatibility Map

**Date:** 2026-05-22
**Branch:** `feat/nextjs15-migration`
**Final risk posture: LOW — 0 blockers, 0 high risks, 2 medium (mitigated)**
**Runtime validation: COMPLETE ✅ — 137 E2E tests, 0 Next.js 15 regressions (2026-05-22)**

---

## Risk Classification

| ID | Risk | Category | Severity | Likelihood | Status |
|---|---|---|---|---|---|
| R-01 | Runtime crash on `params.id` returning `undefined` | Breaking change | MEDIUM | HIGH if missed | ✅ Mitigated — all 23 files fixed |
| R-02 | Runtime crash on `searchParams?.q` returning `undefined` | Breaking change | MEDIUM | HIGH if missed | ✅ Mitigated — all 22 files fixed |
| R-03 | TypeScript compile error on `cookies()` usage | Breaking change | LOW | Certain (TypeScript catches) | ✅ Resolved — 0 errors |
| R-04 | `next-auth` incompatibility | Dependency | MEDIUM | LOW (peer dep declared) | ✅ Confirmed compatible — beta.31 supports `^15` |
| R-05 | React 19 forced upgrade | Dependency | HIGH | N/A | ✅ N/A — Next.js 15 supports React 18 |
| R-06 | `fetch()` cache behaviour change breaking external API calls | Behaviour | LOW | LOW | ✅ N/A — AVANIIS uses Drizzle ORM, not raw fetch |
| R-07 | Build regression (page count drop) | Quality | MEDIUM | LOW | ✅ 112/112 pages confirmed |
| R-08 | Turbopack dev instability | Dev tooling | LOW | LOW | ⏭️ Deferred — production unaffected |
| R-09 | `nodemailer` peer dep warning causing install failure | Dependency | LOW | LOW | ✅ Pre-existing warning, non-blocking |
| R-10 | `drizzle-orm` incompatibility | Dependency | MEDIUM | LOW | ✅ Confirmed — ORM is framework-agnostic |
| R-11 | `@xyflow/react` incompatibility (org chart) | Dependency | MEDIUM | LOW | ✅ Confirmed — React 18 client component, no Next.js API usage |

---

## Compatibility Map

### Core Framework
| Component | Compatible? | Notes |
|---|---|---|
| Next.js App Router | ✅ | All 112 pages use App Router |
| Server Components | ✅ | `async` components unchanged |
| Server Actions | ✅ | `'use server'` directive unchanged |
| Route Handlers (API) | ✅ | `GET/POST/PATCH/DELETE` handlers unchanged |
| Middleware | ✅ | `middleware.ts` Auth.js pattern unchanged |
| `generateMetadata` | ✅ | `params` made async where applicable |
| `next/navigation` (`redirect`, `notFound`) | ✅ | No API changes |
| `next/headers` (`cookies`, `headers`) | ✅ after fix | Now async — all callsites updated |
| `next/image` | ✅ | No breaking changes in Next.js 15 |
| `next/link` | ✅ | No breaking changes |
| `next/font` | ✅ | Google Fonts config unchanged |

### Authentication
| Component | Compatible? | Notes |
|---|---|---|
| `next-auth` v5 beta.31 | ✅ | Peer dep explicitly covers `^14 \|\| ^15` |
| `@auth/drizzle-adapter` | ✅ | ORM adapter, no Next.js version dependency |
| Azure Entra ID OIDC | ✅ | External IdP, unaffected by Next.js version |
| `auth()` in Server Components | ✅ | Same API |
| `requireRole()` | ✅ | Pure function, no Next.js API |

### Database & ORM
| Component | Compatible? | Notes |
|---|---|---|
| `drizzle-orm` | ✅ | Framework-agnostic |
| `drizzle-kit` migrations | ✅ | Build-time only |
| `lib/db.ts` pool config | ✅ | Neon PostgreSQL, not affected |
| `lib/encryption.ts` | ✅ | Pure Node.js crypto |
| `lib/audit.ts` | ✅ | Drizzle transaction helper |
| `lib/effective-date.ts` | ✅ | Pure business logic |

### UI & Third-Party
| Component | Compatible? | Notes |
|---|---|---|
| `tailwindcss` | ✅ | Build-time CSS, framework-agnostic |
| `shadcn/ui` | ✅ | React 18 components |
| `@xyflow/react` 12.10.2 | ✅ | React 18 client component |
| `jspdf` 4.2.1 | ✅ | Client-side PDF, no Next.js dependency |
| `isomorphic-dompurify` | ✅ | Node/browser XSS sanitizer |
| `@anthropic-ai/sdk` (ARIA) | ✅ | HTTP client, no Next.js dependency |
| `lucide-react` | ✅ | React icon library |
| `node-cron` | ✅ | Server runtime, no Next.js dependency |

---

## Breaking Changes — Detailed Compatibility

### BC-01: Async `cookies()` and `headers()`
- **Scope:** All Server Components and Route Handlers calling `cookies()` or `headers()` directly
- **Detection:** TypeScript compile error `Property 'get' does not exist on type 'Promise<...>'`
- **AVANIIS callsites fixed:** 5 layouts + `lib/locale-server.ts`
- **Pattern applied:** `(await cookies()).get(key)` | `getLocale()` made async

### BC-02: Async `params`
- **Scope:** All dynamic route segments — `app/**/[param]/page.tsx`, `layout.tsx`, `route.ts`, `generateMetadata`
- **Detection:** NONE from TypeScript (runtime-only)
- **AVANIIS callsites fixed:** 20 pages + 3 API routes
- **Pattern applied:**
  ```typescript
  // Before
  export default async function Page({ params }: { params: { id: string } }) {
    const id = params.id
  
  // After
  export default async function Page({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
  ```

### BC-03: Async `searchParams`
- **Scope:** All pages accepting `searchParams` prop
- **Detection:** NONE from TypeScript (runtime-only)
- **AVANIIS callsites fixed:** 22 pages
- **Pattern applied:**
  ```typescript
  // Before
  export default async function Page({ searchParams }: { searchParams?: { q?: string } }) {
    const q = searchParams?.q
  
  // After
  export default async function Page({ searchParams }: { searchParams?: Promise<{ q?: string }> }) {
    const sp = await (searchParams ?? Promise.resolve({}))
    const q = sp.q
  ```

### BC-04: `fetch()` cache behaviour
- **Scope:** Any Server Component or Route Handler using `fetch()` with implicit caching
- **AVANIIS impact:** None — all data access is via `drizzle-orm` directly; no `fetch()` caching relied upon

---

## Lessons Learned

1. **Always run typecheck first** — BC-01 was instantly caught; BC-02/BC-03 were not. TypeScript alone is insufficient for this migration.
2. **Params/searchParams require manual audit** — No automated tool catches these. A grep for `params\.` and `searchParams\.` in page files is the only reliable approach.
3. **Verify `latest` npm tag** — `latest` resolves to `16.2.6` (Next.js 16), not `15.x`. Target by exact version, not tag.
4. **React 18 stays** — Widely assumed React 19 is required for Next.js 15. It is not. Checking peer deps before starting saves significant scope creep.
5. **Lib abstraction pays off** — `lib/locale-server.ts` centralised all cookie reads. One async fix in `getLocale()` propagated cleanly to all 13 callers with no regressions.
