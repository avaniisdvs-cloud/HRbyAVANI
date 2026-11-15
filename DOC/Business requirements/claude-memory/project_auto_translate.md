---
name: project-auto-translate
description: "EN→AR auto-translation framework added 2026-05-26 — architecture, field coverage, and extension pattern"
metadata: 
  node_type: memory
  type: project
  originSessionId: 5f491972-ddff-44e6-9351-c851ed5d5182
---

Auto-translation framework (EN→AR only) was implemented 2026-05-26.

**Core files:**
- `lib/translation.ts` — server-side service; uses ANTHROPIC_API_KEY (Claude Haiku); configurable via TRANSLATION_PROVIDER env var (anthropic|google|azure|mock); in-memory cache (500 entries max); never throws
- `app/api/translate/route.ts` — POST /api/translate; requires session; used by UI forms for real-time preview
- `hooks/useAutoTranslate.ts` — React client hook; returns `{ translate, translating }`

**Where translation happens (server-side, all forms):**
- `modules/core-hr/actions.ts` — createPerson translates fullNameAr; updatePerson retranslates when firstNameEn/middleNameEn/lastNameEn patched
- All 11 MDM action files in `app/(hr-admin)/master-data/*/components/*Actions.ts`

**Where UI auto-fill is wired (onBlur):**
- PersonNewForm.tsx, PersonEditForm.tsx — English name blur → fullNameAr
- DepartmentDrawer.tsx — nameEn blur → nameAr

**To add UI auto-fill to another MDM drawer:**
1. `import { useAutoTranslate } from '@/hooks/useAutoTranslate'`
2. `const { translate, translating } = useAutoTranslate()` in component
3. Add `onBlur={async () => { if (enValue && (!arValue || enValue !== editRecord?.enField)) { const ar = await translate(enValue); if (ar) setArValue(ar) } }}` to the English input

**Why:** fullNameAr made optional in CreatePersonSchema Zod (was `min(1)`); server action enforces non-empty after translation. Same pattern applied to all MDM Zod schemas and manual validation functions.

**Direction guard:** Only EN→AR. AR→EN translation is NEVER triggered. Arabic fields remain editable.

**How to apply:** If adding a new bilingual field pair, follow the same two-layer pattern: server action calls `translateToArabic(enValue) ?? ''`; UI onBlur calls `translate(enValue)`.
