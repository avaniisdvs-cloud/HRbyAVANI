# Auto-Translate EN→AR Framework

**Created:** 2026-06-12 (documentation of framework implemented May 2026)

## Purpose
AVANIIS HR is bilingual-mandatory (ADR-001 rule 4: every user-facing string needs `name_en` AND `name_ar`). This framework auto-fills the Arabic value when an admin enters only English, so MDM and configuration screens never persist a missing `name_ar`.

## Components
| Component | Path | Role |
|---|---|---|
| Core service | `lib/translation.ts` | `translateToArabic()` — EN→AR translation with graceful fallback |
| API route | `app/api/translate/` | Server endpoint used by client-side hook |
| Client hook | `useAutoTranslate` | Live AR suggestion in create/edit forms |

## Rules (non-negotiable)
1. **EN → AR only.** Arabic text entered by a human is authoritative and is **never** translated back to English or overwritten.
2. All MDM create/update server actions call `translateToArabic` when `name_ar` is blank.
3. Any **new bilingual field** must follow the same pattern — wire `translateToArabic` in its server action and `useAutoTranslate` in its form.
4. Translation failure must not block the write — fall back to persisting the EN value with the gap surfaced for later correction (never crash the action).

## Where it is used
All 9 MDM entities (departments, jobs, grades, locations, etc.), workflow/absence configuration names, and any settings screens with bilingual labels. Referenced by `docs/LEAVE-BALANCES-REDESIGN-SPEC.md` (Rule 4).

## Known open items
Bilingual UI gaps recorded in QA/QC register (W7 cluster: approval/ESS/document/letter/insurance bilingual LOW findings) are display-side issues, not framework issues.
