# Automatic CV Language Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Infer the base CV language and apply it consistently to every generated content surface without routine language selection.

**Architecture:** Persist validated language/confidence on each document. Shared contracts resolve content language independently of the two-language interface. Extend AI, storage, jobs, and rendering around that shared decision, with lazy detection and invalidation.

**Tech Stack:** Node 22.23.4, TypeScript, npm workspaces, React/Vite, Wrangler, hosted Supabase/Postgres, existing structured AI runner.

**Spec:** `docs/superpowers/specs/2026-11-03-automatic-cv-language-design.md` (approved 3 November 2026).

## Global Constraints

- Preserve unfinished changes and other worktrees. No resets, broad staging, or unrelated commits.
- One base CV; another upload requires deleting it.
- Interface language stays separate. Generated content follows the resolved document language, including translated representations.
- English technology/business terms do not override dominant narrative language. Typed/dictated foreign-language answers remain original evidence.
- Support valid content locales beyond Romanian/English; no silent English fallback for another known locale.
- Correction only for low/medium confidence; historical questions/feedback refresh when needed; accepted prose stays unchanged.
- Use existing accounting, ownership, revision, idempotency and deletion-generation safeguards. No live paid inference or user data deletion in tests.
- Read `docs/setup/environment.md`; use managed dev commands, keep private bindings out of output.

## Review Focus

- Pending first import can resume after a staged draft exists, but another import cannot be applied to it.
- Locale changes during an in-flight request cannot install an old-language result into the current document.
- Legacy saved job CVs still render after base deletion and keep their independent language resources.
- Mixed-language skills/names or a foreign answer cannot flip dominant narrative language.
- Region/script tags and RTL content survive validation, storage, prompts, preview and export.

### Task 1: Shared language contracts

**Files:** `packages/contracts/src/editor/{content-language,model,transport,import,languages,dates}.ts`, `packages/contracts/src/intelligence/{model,context,experience,translation}.ts`, relevant jobs contracts; tests in `apps/api/tests/content-language.test.mjs`.

**Interfaces:** Keep `Locale = 'ro' | 'en'` for UI. Add validated `ContentLocale = string` and `ContentLanguageDecision` in `editor/content-language.ts`; BaseDraft `language` becomes ContentLocale and optional `contentLanguage` stores decision. Export `canonicalContentLocale(value): string|null`, `contentLocale(draft): string`, `contentLanguage(draft): string` (primary language for compatibility), `canCorrectContentLanguage(draft): boolean`, `languageNarrative(draft): string`, `languageInstruction(locale): string`. Decision fields: `locale`, `confidence: 'low'|'medium'|'high'`, `source: 'import'|'narrative'|'user-correction'|'translation'`, `policyVersion: 'cv-language/1'`, optional `narrativeFingerprint`, optional bounded `labels: Record<string,string>`. Decisions override legacy fields except explicit translated target locale; imports may supply `languageConfidence` and `documentLabels` alongside `detectedLanguage`. Unknown/insufficient language has no decision, using the current UI-derived draft fallback.

- [x] Write tests for French/Arabic round trips, invalid tags/instruction strings, Romanian legacy payloads, import confidence, correction eligibility, explicit translated target, and narrative excluding isolated names/skills/answers.
- [x] Run `node --experimental-strip-types --test apps/api/tests/content-language.test.mjs`; observe missing behavior.
- [x] Implement contracts/validation and generalize language-specific validators without changing UI locale validation. Preserve all historical receipts and snapshots.
- [x] Run targeted contracts/API tests; record downstream typing changes needed by later tasks. Fix the pre-existing narrow `experience.ts` unknown-skills TypeScript error if still present.

### Task 2: Detection and AI prompt propagation

**Files:** `apps/api/src/intelligence/{operations,experience-operations,routes,configured}.ts`, new `language-operations.ts`, `apps/web/src/base/intelligence.ts`, targeted API tests.

**Consumes:** Task 1 language contracts.
**Produces:** Optional `IntelligenceClient.detectLanguage(context: IntelligenceContext, recoverOnly?: boolean): Promise<ContentLanguageDecision>` calling `/v1/intelligence/language`; backed by owned saved snapshot, existing operation accounting/recovery, and narrative fingerprint. Import extraction returns multilingual language/confidence/labels. Expose required document-label keys as a shared constant for Task 4.

- [x] Write tests exercising real route/operation builders with synthetic runner outputs: dominant Romanian plus tech terms, French/Arabic locale, mixed-language answers, malicious client feedback locale, insufficient manual prose, stale snapshot and idempotent recovery.
- [x] Run relevant tests to observe failures, then add bounded detection/localization and import outputs. Reuse existing durable operation mechanisms; do not invent an unaccounted provider call.
- [x] Pass authoritative document locale to questions, hints, explanations, assessment, preview, skills, summary, rewrite, translation commentary, streaming and provider fallback paths. Preserve exact evidence.
- [x] Make language-dependent identities/cache compatibility include locale; do not mutate historical accepted prose/answers. Keep legacy receipts recoverable but not reusable as current mismatched feedback.
- [x] Run targeted intelligence suites and report tested commands/results and interfaces.

### Task 3: Jobs, database locale support, and single-base import enforcement

**Files:** `apps/api/src/jobs/`, `apps/api/src/db/{imports,languages,supabase}.ts`, `apps/api/src/intelligence/import-workflow.ts`, new migration, database/API tests, job API transports/contracts as needed.

**Consumes:** Task 1 language contracts and Task 2 detection context.
**Produces:** Multilingual document identity/storage and prompt locale; atomic server rejection of second-base uploads with recoverable first-import identity.

- [x] Add tests for canonical locale keys and blocked second import including concurrent acceptance.
- [x] Create additive migration using available Supabase CLI; update two-language constraints/RPC checks consistently, preserve ownership/search_path/grants/idempotency, and reject second imports atomically while allowing same first-import recovery.
- [x] Run local database harness plus API tests. Prepare migration for hosted application only after local validation; do not change credentials or delete user data.

### Task 4: Frontend detection lifecycle, confidence controls, and document output

**Files:** `apps/web/src/App.tsx`, profile/import components, new language hook/control, coaching hooks/components, `apps/web/src/languages/`, `apps/web/src/components/{DocumentContent,VoiceTyping,LiveDictation}.tsx`, exports/templates/sections; frontend tests.

**Consumes:** All earlier interfaces; `detectLanguage` and shared labels.
**Produces:** Automatic saved language resolution for manual/legacy documents, confidence-only correction UI, removed routine selectors/update entry, same-language content output, multilingual recorded speech input.

- [x] Add failing component tests for high-confidence no-selector, low/medium correction, UI-language independence, once-only manual/legacy detection, stale results, and unavailable/recoverable detection.
- [x] Mount bounded detection after substantial narrative/save. Preserve corrections, fence results and retain operation IDs. Seed truly new manual drafts from interface locale. Refresh stale feedback lazily and do not trigger bulk re-inference on UI switches.
- [x] Remove routine base selectors and update/merge UI entry. Direct routes with an existing base show the delete-first explanation; first-import review/recovery remains reachable. Keep explicit translation target selection distinct.
- [x] Use shared localized labels and actual locale for document headings, dates, duration, direction, preview/export. Cover French and Arabic/RTL and use appropriate font fallbacks; no silent English headings when labels unavailable.
- [x] Use automatic-language recorded transcription when live browser recognition would force the CV language. Keep original transcripts and generated enrichment separate.
- [x] Run focused frontend/voice/render suites, full typecheck and relevant build. Browser flow: profile with inferred language -> confidence correction where eligible -> content changes language while navigation stays unchanged; also verify no update action and multilingual exported document.

### Task 5: Integration verification and review

**Files:** Tests/docs touched by earlier tasks, environment-safe validation only.

- [x] Run API and frontend suites, typecheck, build/export checks, and database harness. Investigate failures against the saved pre-change baseline; fix relevant regressions without reverting existing work.
- [x] Run managed `dev:doctor`, browser checks using Playwright because Browser plugin is absent, and capture useful evidence outside the repo. Do not start duplicate services.
- [x] Request fresh review of this task's changes relative to the saved source baseline, fix consequential issues with focused regression tests, rerun affected checks.
- [x] Update design status and documentation. Report changed behavior, test evidence, and any hosted migration/provider or font/OCR limitations honestly.

## Execution record

Implementation is authorized. Shared contracts precede dependent changes. Work stays in the current linked worktree; source baseline is saved at `/tmp/resumora-cv-language-baseline`. Do not commit mixed pre-existing files wholesale. Baseline typecheck currently fails at `packages/contracts/src/intelligence/experience.ts:752` (`v.skills` is unknown); preserve/report unrelated failures.


### Final implementation record — 3 November 2026

All language tasks and the single final review fix wave are complete. Review covered provider-adapter validation, historical accepted import updates, extraction document pins, navigation recovery, insufficient inference gating, RTL PDF validation, translated label persistence and full regional/script translation keys. Existing accepted wording and original answers remain intact. No mixed user changes were committed or pushed.

The additive migration was applied through the Supabase plugin to the verified Resumora project and recorded as `20261103004350_p8_multilingual_content_single_base.sql`; the CLI-created local file was renamed to match that hosted ledger version without changing SQL. Read-only postchecks confirmed canonical full locales, historical English storage identity, import/extraction triggers and authenticated-only new write RPCs. The managed app was restarted using `dev:start`. `dev:doctor` confirms this checkout owns the running frontend/API and exactly one import worker, and the frontend-to-session route is reachable. Live provider inference/fluency was not exercised.

Final evidence:

- API: **526/526 passed**.
- Final full frontend run: **837/847 passed**. Four import-removal cases timed out during concurrent test load; their entire 12-test suite passed in isolation without production changes. The other six failures belong to the concurrently developed skills-save/reserved-skills changes; none of those six failing tests existed in the saved language review baseline. That work was preserved. The earlier pre-concurrency full frontend run passed 808/808; new language/translation/PDF regressions passed their focused runs and the final run.
- Typecheck and production build passed during final verification; concurrent skills work continues to change the checkout, so this is not a certification of that separate work.
- Focused native PostgreSQL suites passed: language storage/lineage, pending import concurrency, base removal, workspaces and accepted A→B import upgrade. After hosted rollout/file reconciliation, language 9/9 and historical upgrade 1/1 passed again. The legacy aggregate database harness retains the same 12 failures independently reproduced against the pre-change source baseline.
- Actual Chromium checks passed for French, low-confidence correction with accepted prose preserved, Arabic/RTL and mobile width. No application console errors; isolated Vite HMR warnings were excluded from app errors.
- Real French and Arabic PDFs passed the production content/geometry/link validator and embedded-font inspection: one page each, 9 and 14 embedded fonts. Translation integration tests cover generation → acceptance → reopening → preview/static export, including one localization catalog across multiple batches.

No paid provider evaluation, Cloudflare deployment, base deletion or user-data cleanup was performed. Review artifacts remain in the ignored plan workspace because the source changes are intentionally uncommitted alongside existing user work.
