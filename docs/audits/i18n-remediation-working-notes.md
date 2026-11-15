# i18n / RTL / Language-Preference Remediation — Working Notes

> Internal engineering log for the EN↔AR localization remediation program.
> Companion to the audit report. Audit verdict being remediated: **PARTIAL — NOT ENTERPRISE-READY**.

## Governance context

- `main@f524664` is **Foundation-certified & frozen** (`docs/FOUNDATION-FREEZE-RECORD-v1.0.md`).
- All work is on branch **`fix/i18n-rtl-language-preference-enterprise`** (cut from `61eb76b`).
- **No merge to certified `main`** without Foundation Board / PO sign-off.
- Constraints honored:
  - Frozen `lib/auth.ts` session model **not modified** — source-of-truth unification achieved via a layout-level resolver + server action instead.
  - **No schema change / no migration** — `persons.preferred_language varchar(10)` already exists (`drizzle/schema/foundation.ts:293`).
  - All DB writes follow **ADR-001** (`db.transaction()` + `audit.log(tx, …)`).
  - No weakening of auth/authz/HR/payroll/finance/audit controls.

## Baseline (Phase 1) — captured 2026-06-13

| Item | Value |
|---|---|
| Starting branch | `main` |
| Starting commit | `61eb76bca4e021f304ade570dc0137fbb2cc11de` |
| Working branch | `fix/i18n-rtl-language-preference-enterprise` |
| `pnpm typecheck` | **PASS** — 0 errors |
| `pnpm test` (vitest) | **PASS** — 167 files, 3107 passed, 15 skipped, 7 todo |
| `pnpm lint` | **PASS** — only pre-existing `@next/next/no-img-element` / `no-html-link-for-pages` warnings |
| Known pre-existing noise | ARIA integration tests log Anthropic "credit balance too low" 400s but pass via deterministic fallback (not a regression, not i18n-related) |

No pre-existing failures. Repo is healthy; any new failure is attributable to this work.

## Continuation pass (2026-06-13, same branch)

### Priority 1 — DB-first source of truth ✅
- Corrected `resolveLocale` from **cookie-first** to **DB-first**: `persons.preferred_language` (authenticated) → cookie (guest/fallback) → 'en'. A stale cookie can no longer override an authenticated user's saved language.
- Extracted pure `chooseLocale(dbPref, cookie)` into db-free `lib/i18n.ts`; DB read is `cache()`-wrapped (deduped across root + child layouts per render). +6 tests cover the full acceptance matrix. Commit `64f29ab`.

### Priority 2 — Mixed-language chrome migration ✅ (mixed class fully closed)
- Ran 4 parallel batches (employee/manager, absence, workflows/delegations, persons/settings) + 2 manual fixes. ~45 files; `locale` threaded server→client throughout.
- **Static sweep result: ZERO genuine EN·AR mixed-display chrome remains** (3 residual `·` are single-language strings with an internal separator). Commits `4d5db92`, `976d8ae`, `9d3823e`.
- Updated `manager-leave-navigation.test.ts` (it had asserted the retired bilingual literal).
- Gates: typecheck 0 · tests 3124 pass · build ✓ 153 routes.

### Remaining gap (→ verdict PARTIAL): English-ONLY hardcoded chrome
- A **distinct, larger** class survives — not mixed-language, but English strings that don't switch to Arabic: **~108 toast titles** (all genuine, e.g. "Save failed", "Employee updated", "Hire completed"), **~100+ genuine placeholders** (excl. `e.g.`/code hints), plus assorted validation/empty-state strings.
- Distribution: heaviest in `persons` (57 placeholders / 37 toasts), `components` (37/29), `settings` (30/10); employee-facing is light (12/2); workflows/absence/payroll minimal.
- This is the original audit's "~50% hardcoded English" / unfinished app-wide i18n rollout. The helpers (`t`/`tk`/`pickLabel`) + threading pattern are proven; remaining work is mechanical but sizeable, and is the path from PARTIAL → YES.

### Continuation pass 2 — toasts + placeholders (drive toward YES)
- **Enabler:** added `components/providers/LocaleProvider.tsx` → `useLocale()` — a thin client context distributing the server-resolved locale so client components localize toasts/placeholders without prop-drilling. NOT a translation library / NOT a 2nd source of truth (value still from `resolveLocale`). Wrapped once at root layout. Commit (locale-context).
- **Toasts wave (3 parallel batches):** ~80 English-only `toast()` titles/descriptions + inline errors localized via `useLocale()` (persons dialogs/forms/contracts/dependents/docs/bank, accommodations, org-chart drawers/shell/panel, settings policy/notifications/form-layout/custom-fields/communication, ARIA reports). `admin-preview` confirmed dev-only mock-up (skipped, 0 real toasts). Genuine English-only toasts now **0** (the 18 residual `title:` are `titleAr`-backed data objects rendered `isAr ? titleAr : title`).
- **Placeholders wave (3 parallel batches):** ~87 genuine instruction/hint placeholders localized (Enter/Search/Filter/Describe/Select/notes/field-purpose). Deliberately preserved English: example-value placeholders (sample data), **type-to-confirm keywords** (DELETE STAGING DATA / EXECUTE MIGRATION / SEED / CONFIRM — verbatim-compared), codes, format hints.
- Gates after each wave: typecheck 0 · tests 3124 pass · build ✓ 153 routes.

### Final state & honest verdict — PARTIAL (close)
Static sweep (initial → final): **mixed EN·AR chrome ~191 → 0 genuine** · **English-only toasts ~108 → 0 genuine** · **placeholders ~129 → ~57 (mostly example-values/codes intentionally kept)**.
**Remaining genuine English-only tail (~100–130 strings, admin forms):** ~19 button labels (Save/Cancel/Submit/…), ~46 `setError` validation messages (some carry BR codes — need careful per-string review), plus scattered form `<Label>`/section-heading literals. This is the asymptotic end of the app-wide i18n rollout (every button/label/validation across 153 routes). Verdict stays **PARTIAL** — will not certify YES while genuine English-only chrome remains in major pages. Path to YES: a buttons+labels+headings wave (low risk; `common.*` keys already exist in `tk`), then a careful validation-message pass.

## Phase log

### Phase 2 — Standardize single-language menu rendering ✅
- Added `pickLabel(item, locale)` to `lib/i18n.ts` — single source of truth for menu label selection (EN-only in `en`, AR-only in `ar`, graceful fallback, never concatenated).
- `AdminSidebar.tsx` (MANAGER + admin roles): removed opposite-language subtitle span; item/group labels + collapsed-rail tooltip + aria-labels now via `pickLabel`/locale; replaced two hardcoded mixed `… · …` aria-labels.
- `EmployeeSidebar.tsx` (EMPLOYEE): removed opposite-language subtitle span; label via `pickLabel`.
- `WorkspaceRail.tsx` (HR/Super Admin): label via `pickLabel`; fixed 3 `EN · AR` tooltips → active-language only.
- `WorkspaceSecondaryNav.tsx`, `MobileBottomBar.tsx`: routed all label selection through `pickLabel`.
- **Result:** every role's menu now renders exactly one language. Manager/Employee dual-label defect eliminated.
- `pnpm typecheck` → **0 errors** after changes.
- Deferred to Phase 6 (visible mixed-language, non-menu): `WorkflowTemplateForm.tsx:308`, `ProbationStatusCard.tsx:221`, `AppearanceSettingsClient.tsx` theme tooltips.

### Phase 3 — Unify language source of truth ✅
- New `lib/language-preference.ts` → `resolveLocale(personId)`: **cookie hint → persons.preferred_language → 'en'**. Single resolver for all shells.
- New `lib/actions/language-preference.ts` (`'use server'`) → `setLanguagePreference(locale)`: validates, sets cookie, and (when authenticated) persists `persons.preferred_language` in a **transaction paired with an audit row** (ADR-001, event `PERSON.PREFERENCE.LANGUAGE_CHANGED`). Self-scoped authorization (own row only) — no privilege change, `lib/auth.ts` untouched.
- `LocaleSwitcher.tsx` now calls the server action (was a raw client cookie write) → cookie + DB stay in sync; one source of truth.
- All four locale-resolving layouts (`app/layout.tsx`, `(hr-admin)`, `(employee)`, `(app)`) now use `resolveLocale(session.personId)`. Root layout added `auth()` so `<html dir>` honors the saved preference on a fresh device too (no RTL/chrome mismatch).
- Guests / first-time users: cookie absent + no personId → safe `'en'` fallback; DB read wrapped in try/catch for build-time.

### Phase 4 — Self-service language preference ✅
- New reusable `components/settings/LanguagePreferenceCard.tsx` — EN/AR radiogroup, shows current value, same `setLanguagePreference` backend (no duplicate state), self-locale copy.
- Placed in ESS **`/me/profile`** (all employees) and **`/settings/appearance`** (top admin roles). Universal persistent control remains the header toggle in every topbar (now DB-backed). No admin-only dependency for employees/managers.
- `pnpm typecheck` → **0 errors** after Phases 3+4.

### Phase 5 — One i18n strategy (resolve dormant stack) ✅
- **Finding:** `react-i18next` had **zero** real consumers — `useTranslation` was never called; `I18nProvider`/`i18n-runtime` only referenced each other + the root layout; `messages/*.json` only read by `i18n-runtime`. The live system is SSR-resolved `locale` + `t(locale,en,ar)` (17 files) + bilingual DB columns.
- **Decision:** standardize on the SSR-first system (correct for a Server-Component-first app); retire the client-only react-i18next runtime to remove the competing stack.
- New `lib/i18n-messages.ts` → `tk(locale, key, fallback?)`: dot-path lookup against `messages/{en,ar}.json`, server+client safe, EN→key fallback. The dictionaries are now **live**.
- Removed `<I18nProvider>` from root layout; deleted `components/providers/I18nProvider.tsx` + `lib/i18n-runtime.ts`. Updated `lib/i18n.ts` header to document the single strategy.
- Canonical model now: **one** SSR locale → `t()` for one-offs, `tk()` for shared keys, `pickLabel()` for nav, `*_en/*_ar` for data. (`react-i18next`/`i18next` remain in package.json as unused deps — harmless; removal deferred to avoid dependency-graph risk under freeze.)
- `pnpm typecheck` → **0 errors**.

### Phase 6 — Localize high-impact UI chrome ⚠️ (representative + named hotspots; remainder justified P1)
- **Key discovery:** the app uses a deliberate **simultaneous-bilingual "EN · AR" display convention** in **176 files / 549 occurrences** (e.g. `Person · الموظف`, inline `EN · AR` errors, split-on-` · ` rendering). This is *intentional bilingual display* — the root cause behind the audit's "hardcoded English / mixed-language" findings. Reaching the clean-single-language target is therefore an **app-wide systematic conversion**, not a handful of patches.
- **Fixed this pass (proving the pattern end-to-end):**
  - `persons/new/page.tsx` — breadcrumb/title/subtitle via `t(locale,…)` (server).
  - `ProbationStatusCard.tsx` (+ probation `page.tsx`) — threaded `locale`; header, status line, timeline dots, summary now single-language (employee-facing).
  - `AppearanceSettingsClient.tsx` (+ page) — **fully converted** (~12 spots: toasts, headers, swatch tooltips via `pickLabel`, density labels, logo, save button). Representative deep-bilingual form.
  - `absence/page.tsx` — pagination (`← Prev`/`Next →` → `tk(common.prev/next)`), "Page X of Y", "Loading…" → `tk(common.loading)`.
- **Justified P1 remainder (~170 files):** convert the EN·AR convention to single-language-per-locale via `t`/`tk`/`pickLabel` + `locale` threading. Top offenders: `LeaveRequestNewForm.tsx` (43), `WorkflowTemplateForm.tsx` (21), `workflows/.../history` (20), `WorkflowDecisionForm` (16), `DelegationCreateForm`/`PersonNewForm` (14). Mostly admin/low-traffic; functional today; needs reviewable, tracked migration rather than one risky sweep under freeze. Infra + proven pattern now in place.
- `pnpm typecheck` → **0 errors** after Phase 6 batch.

### Phase 7 — RTL / LTR hardening ✅ (verified; consistency fix delivered in Phase 3)
- RTL is **global**: `<html dir={direction(locale)}>` (root), `(app)` shell sets `dir`, `(employee)`/`(auth)` inherit. No forced `dir="ltr"` overrides in any shell.
- Phase 3 removed a latent bug: root + child layouts now resolve locale via the *same* `resolveLocale`, so `<html dir>` can no longer disagree with content direction (the audit's "only menu changes direction" symptom).
- Inline `dir`/`lang` are now applied conditionally (`locale === 'ar'`) only where Arabic text sits inside an otherwise-LTR context.

### Phase 8 — Tests & quality gates ✅
- New `tests/unit/i18n-localization.test.ts` (11 tests): `pickLabel` (single-language, no concatenation, fallback, group shape), `tk` (key lookup, en/ar distinct, en-fallback, missing-key→key), `direction`/`isRtl`.
- **Gates:** `pnpm typecheck` 0 errors · `pnpm test` **3118 passed** / 168 files (was 3107/167; +11, 0 regressions) · `pnpm lint` 0 errors (14 pre-existing `<img>` warnings) · `pnpm build` **✓ Compiled successfully**, 153 routes, exit 0.
