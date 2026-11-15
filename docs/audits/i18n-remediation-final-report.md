# English ↔ Arabic Localization Final Remediation Report

> Branch `fix/i18n-rtl-language-preference-enterprise` · cut from frozen `main@61eb76b` (Foundation-certified `f524664` lineage) · 2026-06-13
> Companion working log: `docs/audits/i18n-remediation-working-notes.md`

## 1. Final Verdict

## 🟡 PARTIAL — structural fixes complete; mixed-language, toasts & placeholders done; a bounded validation/label tail remains

**One line:** Every structural defect is fixed and verified, and the visible chrome is now overwhelmingly single-language: mixed EN↔AR is **eliminated (0 genuine)**, English-only **toasts (0 genuine)** and **~87 placeholders** localized. The honest remainder is a bounded tail — ~19 button labels (Save/Cancel/…) + ~46 validation messages + scattered `<Label>`/headings, in admin forms — the asymptotic end of the app-wide i18n rollout. I will not certify YES while genuine English-only chrome remains in major pages.

## 2. Executive Summary

3 remediation passes, 16 checkpoint commits, all gates green at every step (typecheck 0 · 3124 tests · lint 0 errors · build ✓ 153 routes).

**Fully fixed & verified:**
- **Mixed-language display (the audit's headline defect, incl. K1207): 0 genuine occurrences** app-wide.
- **Source of truth — DB-first**: `persons.preferred_language` (authenticated) → cookie (guest/fallback) → `'en'`; a stale cookie can no longer override a saved preference. Pure `chooseLocale()` + 6 acceptance tests.
- **Menus** single-language for every role; **header toggle + self-service card** share one audited server action; **login** honors saved language (incl. `<html dir>`); **RTL** global; **one i18n strategy** (react-i18next retired).
- **Toasts**: ~80 English-only `toast()` titles/descriptions localized via a new `useLocale()` distribution context → **0 genuine English-only toasts**.
- **Placeholders**: ~87 genuine instruction/hint placeholders localized (example-values and type-to-confirm keywords correctly preserved).

**Remaining (why PARTIAL):** ~19 button labels + ~46 `setError` validation messages + scattered form labels/headings render English in Arabic mode, concentrated in HR-admin forms. Bounded, characterized, mechanical — but not yet done.

## 3. Source-of-Truth Validation

`chooseLocale(dbPref, cookie)` — pure, tested: **DB → cookie → 'en'**.

| Scenario | Result | ✓ |
|---|---|---|
| Auth, DB=`ar`, no cookie | Arabic | ✅ |
| Auth, DB=`ar`, **stale cookie=`en`** | Arabic (DB wins) | ✅ |
| Auth toggles EN / AR | cookie + DB both updated | ✅ |
| Unauthenticated / no DB pref | cookie fallback | ✅ |
| No DB pref + no cookie | `en` | ✅ |

Header toggle + self-service card → `setLanguagePreference` (cookie + DB, transaction + audit, ADR-001). DB read `cache()`-deduped. `lib/auth.ts` untouched.

## 4. Localization Coverage by Category

| Category | Initial | Final | Status |
|---|--:|--:|---|
| Mixed EN·AR chrome | ~191 | **0 genuine** | ✅ done |
| Dual-language nav subtitles | 2 shells | 0 | ✅ done |
| English-only toast titles | ~108 | **0 genuine** | ✅ done |
| Genuine-chrome placeholders | ~129 | ~57 (mostly kept example-values/codes) | ✅ substantially done |
| Button labels (Save/Cancel/…) | — | ~19 | 🟡 tail |
| `setError` validation messages | — | ~46 | 🟡 tail (some carry BR codes) |
| Form `<Label>` / section headings | — | scattered | 🟡 tail |
| Dormant react-i18next | 1 stack | 0 | ✅ retired |

## 5. Role-by-Role Validation

| Role | English | Arabic | Menu | RTL | Preference | Verdict |
|---|---|---|---|---|---|---|
| EMPLOYEE | clean | clean (chrome, toasts, placeholders localized) | ✅ | ✅ | ✅ DB-first | 🟢 strong |
| MANAGER (K1207) | clean | clean (leave/approvals/toasts localized) | ✅ single-lang | ✅ | ✅ | 🟢 fixed |
| HR_ADMIN | clean | menus/headings/forms/toasts/placeholders clean; **some button labels + validation English** | ✅ | ✅ | ✅ | 🟡 small tail |
| HR_DIRECTOR | clean | same as HR_ADMIN | ✅ | ✅ | ✅ | 🟡 small tail |
| PAYROLL_ADMIN | clean | clean (minimal surface) | ✅ | ✅ | ✅ | 🟢 |
| FINANCE | clean | clean (minimal surface) | ✅ | ✅ | ✅ | 🟢 |
| SUPER_ADMIN | clean | menus/forms/toasts clean; admin-builder buttons/validation English | ✅ | ✅ | ✅ | 🟡 small tail |

No role shows mixed-language anywhere. The 🟡 tail is English-only **buttons + validation** in admin forms.

## 6. Static Sweep Results (mandate §8)

| Pattern | Initial | Final | Remaining justification |
|---|--:|--:|---|
| `EN · AR` mixed-display chrome | ~191 | 0 genuine | 7 residual `·` are single-language separators |
| English-only toast titles | ~108 | 0 genuine | 18 residual are `titleAr`-backed data objects rendered `isAr?titleAr:title` |
| Genuine-chrome placeholders | ~129 | ~57 | mostly example-values + type-to-confirm keywords (correctly kept English) |
| Button labels | — | ~19 | **rollout tail** — `common.save/cancel/…` keys exist in `tk` |
| `setError` validation | — | ~46 | **rollout tail** — some carry BR codes; need careful per-string review |
| `<Label>` / headings | — | scattered | rollout tail |
| Dormant react-i18next | 1 | 0 | retired |

## 7. Tests and Quality Gates

| Command | Result | Notes |
|---|---|---|
| `pnpm typecheck` | ✅ 0 errors | every checkpoint (incl. all 6 parallel subagent batches) |
| `pnpm test` | ✅ 3124 passed / 168 files | +17 i18n tests; 1 stale test updated; 0 regressions |
| `pnpm lint` | ✅ 0 errors | 14 pre-existing `<img>` warnings |
| `pnpm build` | ✅ Compiled successfully | 153 routes, exit 0 |

## 8. Database / Schema Impact

- **No schema change, no migration.** Self-scoped `setLanguagePreference` write → transaction + audit row (`PERSON.PREFERENCE.LANGUAGE_CHANGED`), ADR-001. No production data touched.

## 9. Remaining Risks

1. **~19 button labels + ~46 validation messages + scattered labels/headings** render English in Arabic mode (admin forms). Functional, bounded. Validation strings need careful review (some embed BR codes / business meaning).
2. Unused `react-i18next`/`i18next` deps remain in `package.json` (runtime removed). Harmless.
3. No live browser/UAT screenshot — deliberately avoided (toggle writes to shared DEV/UAT Neon). Visual UAT recommended pre-merge.

## 10. Merge Recommendation

Strong, fully-verified interim milestone — safe to merge with PO/Foundation Board sign-off (mixed-language eliminated, DB-first source of truth, toasts + placeholders localized, all gates green). **Not a complete YES** until the button-label + validation tail is localized. Recommended final steps: (1) buttons/labels/headings wave (low risk; reuse `tk(locale,'common.*')`), (2) careful validation-message pass.

## 11. Final Yes / No

**Is English ↔ Arabic now enterprise-ready across roles?**

## 🟡 PARTIAL (close).

All structural defects are fixed and verified — no role shows mixed-language anywhere (K1207 resolved, swept to zero), DB-first preference is authoritative over a stale cookie, login persists language, RTL is global, one i18n strategy, and English-only toasts + placeholders are localized — typecheck/tests/build green throughout. It is **not yet YES** because a bounded tail of English-only chrome remains in admin forms: ~19 button labels, ~46 validation messages, and scattered labels/headings. That is the asymptotic end of the app-wide i18n rollout — mechanical with the pattern and `tk` keys in place — and is the last mile to YES. I will not certify YES while that visible English-only chrome remains in major pages.
