# CV tailoring Implementation Plan

> **For agentic workers:** built with the `codex-build` skill (Codex builds in a worktree, Astra reviews, Claude commits). Run one **Part** per branch; the parts stack in order. Steps inside a task are Codex's normal TDD loop: write the acceptance tests, see them fail, implement, see them pass.

**Goal:** turn the current Base CV into a Tailored CV and a cover letter for one saved job, section by section with job-specific questions, show Score 1 → Score 2, and export as PDF/DOCX in 3 templates.

**Architecture:** new `tailored_cvs` / `tailor_runs` / `match_scores` tables behind new Hono routes (`/v1/jobs/:id/tailor`, `/v1/tailor-runs/*`, `/v1/tailored/*`). Every AI call goes through `callModel` with a new cheap/strong model tier. The match score is computed by a pure shared function from model labels. The web reuses the Base CV `Editor` pointed at a tailored document, plus a new full-screen `TailorFlow`.

**Tech stack:** Cloudflare Workers + Hono, Supabase Postgres with RLS and pgTAP, React 19 + @tanstack/react-query, zod 4, Vitest + Testing Library, `docx` (Part 6 only).

**Spec (binding):** `docs/superpowers/specs/2026-11-08-cv-tailoring-design.md`. Where this plan and the spec differ, the spec wins unless this plan says it records a later owner choice.

## Global constraints
- Copy existing patterns: route + `repo.ts` + `memory-repo.ts` + `supabase-repo.ts` per area (like `apps/api/src/jobs/`); web API clients like `apps/web/src/jobs/jobs-api.ts`; react-query keyed by user id; all copy through `t()`; colours only from `apps/web/src/styles/tokens.css`.
- Every AI call goes through `callModel` (`apps/api/src/ai/call-model.ts:127`). New task names are added to the `log_ai_call` allowlist (`supabase/migrations/20261107020000_focus_ai_tasks.sql:23`): `tailor_score`, `tailor_questions`, `tailor_section`, `tailor_verify`, `tailor_translate`, `tailor_letter`.
- The AI never receives the contact header (name, email, phone, address, links). The headline is sent.
- Tailoring reads only `base_cvs` (the current Base CV), never `base_cv_versions`.
- Languages: `ro | en | fr | de | es | it`. Tones: `formal | neutral | confident` (default `neutral`). Sections in order: `experience, skills, summary, achievements, languages`, then `layout` (section order and headline).
- At most 8 job questions per run, each skippable. Job notes are capped at 25 per role (`MAX_JOB_NOTES`), separate from enrichment notes (`MAX_NOTES`).
- Score policy `match/1`: weights requirements 50 / keywords 30 / seniority 10 / language+education 10; `must` = 2× `nice`; met 1, partial 0.5, missing 0; inferred items count as partial until kept; any missing `must` caps the total at 69; bands Excellent 85+ / Strong 70–84 / Fair 50–69 / Low <50; a component with no input is left out and its weight is shared among the rest in proportion.
- No daily limits now, but every run is recorded in `tailor_runs`.
- Each migration is a new file (decision 0008). RLS on every new table is "own rows only" for select/insert/update/delete, like `jobs`.
- No new dependencies except `docx` (Task 25) and the PDF library (Task 24). Files under ~300 lines. Plain words in code.
- Do not open `.env*`, `.dev.vars` or other secret files; use `.dev.vars.example`.

## Review focus
1. **Double-click on Tailor / Start:** a second start for the same job and language returns the existing run, never a second `tailored_cvs` row (Task 12 test).
2. **Job ad in a language outside the 6** (for example Dutch): the CV is written in the Base CV's locale and the steering screen says so (Task 12 test).
3. **Names with diacritics in the export file name:** `Ștefan Ionescu` becomes `Stefan_Ionescu_…`, and characters outside ASCII letters, digits and `_` are dropped (Task 24 test).
4. **Job deleted while a run is open:** run endpoints return 404 `job_not_found`, and the web flow shows "This job was deleted" instead of an error loop (Tasks 12 and 16 tests).
5. **Model returns proposals for unknown or missing item ids:** unknown ids are dropped; items with no proposal keep the Base CV wording (Task 14 test).

---

# Part 1: database and shared schemas (branch `rebuild/tailor-db`, from `main`)

## Task 1: Migration for the tailoring tables

---
files: [supabase/migrations/20261108000000_tailoring.sql, supabase/tests/database/tailoring.test.sql]
new_files: [supabase/migrations/20261108000000_tailoring.sql, supabase/tests/database/tailoring.test.sql]
deps: false
size: 220
---

**Goal:** create `tailored_cvs`, `tailor_runs` and `match_scores` exactly as in the spec ("4. Database"), and add `jobs.user_thoughts text check (char_length <= 2000)` and `jobs.application_status text not null default 'saved' check in ('saved','tailored','applied','interview','offer','rejected')`.
- `tailored_cvs`: `unique (job_id, language)`, `job_id … on delete cascade`, `translated_from … on delete set null`, `template default 'classic' check in ('classic','modern','compact')`, `version int not null default 1`. Writers set `updated_at`, as for `jobs`.
- `tailor_runs.status check in ('running','waiting_user','done','failed')`, `kind check in ('tailor','retailor','section','translate','cover_letter')`.
- `match_scores.target check in ('base','tailored')`, plus an index on `(job_id, target, created_at desc)`.
- RLS and grants are copied from `jobs` (`20261107000000_jobs.sql`). `log_ai_call` is replaced (`create or replace`) with the existing allowlist plus the 6 `tailor_*` tasks.

**Acceptance tests (`supabase/tests/database/tailoring.test.sql`, pgTAP, run with `npm run db:test`):**
- user B can't select, update or delete user A's rows in any of the 3 tables;
- a second `tailored_cvs` row for the same `(job_id, language)` fails;
- deleting a job deletes its tailored CVs, runs and scores;
- `application_status = 'hired'` fails, `'applied'` passes;
- `log_ai_call('tailor_section', …)` succeeds and `log_ai_call('tailor_nope', …)` raises `unknown ai task`.

**Out of scope:** API code, Storage (Task 28).

## Task 2: Shared CV schema: 6 locales, job notes, caps

---
files: [packages/shared/src/cv.ts, packages/shared/src/cv.test.ts, packages/shared/src/categories.ts, packages/shared/src/categories.test.ts, packages/shared/src/notes.ts, packages/shared/src/notes.test.ts]
new_files: []
deps: false
size: 160
---

**Goal:**
- `locale` (`cv.ts:138`) becomes `z.enum(["ro","en","fr","de","es","it"])`, and `Locale` follows.
- `CATEGORY` labels (`categories.ts:40…`) get `fr`, `de`, `es` and `it` titles for every category.
- `NoteSchema` gains `jobId: z.uuid().optional()`. Export `MAX_JOB_NOTES = 25`.
- `carryNotes`/`merge` (`notes.ts:20,35`) cap enrichment notes (no `jobId`) at `MAX_NOTES` and job notes at `MAX_JOB_NOTES` separately; newest kept in each kind.
- Export `mergeNewerNotes(target: CvContent, current: CvContent): CvContent`. For every role in `target` whose id exists in `current`, the notes become the union by note id (current wins), with the same per-kind caps. Facts come from `current` when its `facts.fromNotes` is newer.

**Acceptance tests:**
- `cv.test.ts`: a CV with `locale: "de"` parses, and `"nl"` fails.
- `categories.test.ts`: every category has a non-empty title in all 6 locales.
- `notes.test.ts`:
  - 25 enrichment notes plus 25 job notes all survive `carryNotes`;
  - a 26th job note drops the oldest job note and no enrichment note;
  - `mergeNewerNotes` keeps a note added after the version was saved.

**Out of scope:** the web locale switch (stays EN/RO for the UI).

## Task 3: Shared tailoring and job schemas

---
files: [packages/shared/src/tailor.ts, packages/shared/src/tailor.test.ts, packages/shared/src/jobs.ts, packages/shared/src/jobs.test.ts, packages/shared/src/index.ts]
new_files: [packages/shared/src/tailor.ts, packages/shared/src/tailor.test.ts]
deps: false
size: 200
---

**Goal:** `packages/shared/src/tailor.ts` exports zod schemas and types:
- `TailorLanguageSchema` (the 6), `ToneSchema`, `TailorSectionSchema` (`experience | skills | summary | achievements | languages | layout`), `TAILOR_SECTIONS` in that order.
- `MatchLabelSchema = { ref: string; kind: "requirement" | "keyword"; status: "met" | "partial" | "missing"; evidence: string | null; inferred: boolean }`, and `MatchScoreSchema = { policy: "match/1"; total: number | null; band: "excellent" | "strong" | "fair" | "low" | null; parts: Record<component, { points: number; max: number } | null>; capped: boolean; labels: MatchLabel[] }`.
- `QuestionSchema = { id; section; roleId: string | null; text; kind: "options" | "confirm_inferred" | "flag"; options: string[]; reason: string }`, and `AnswerSchema = { questionId; value: string | null; via: "option" | "typed" | "voice" | "skip" }`.
- `ProposalSchema = { itemId; field; text; inferred: boolean; flags: Flag[] }` and `FlagSchema = { rule: "number" | "entity" | "tool" | "achievement"; detail: string }`.
- `TailorRunSchema` and `TailoredCvSchema`, mirroring the Task 1 columns in camelCase (`content: CvContentSchema`, `baseSnapshot: CvContentSchema`, `coverLetter: CoverLetterSchema.nullable()`).
- `CoverLetterSchema = { body: string(max 4000); hiringManager: string | null; whyCompany: string | null; generatedAt: datetime }`.

`jobs.ts`: `JobSchema` gains `userThoughts: string | null` and `applicationStatus` (the 6 values); `JobPatchSchema` accepts both, optional.

**Acceptance tests:**
- `tailor.test.ts`: each schema accepts a valid sample and rejects one bad field.
- `jobs.test.ts`: `userThoughts` longer than 2000 characters is rejected, and an unknown status is rejected.

**Out of scope:** scoring math (Task 4).

## Task 4: Shared match score

---
files: [packages/shared/src/match-score.ts, packages/shared/src/match-score.test.ts, packages/shared/src/index.ts]
new_files: [packages/shared/src/match-score.ts, packages/shared/src/match-score.test.ts]
deps: false
size: 180
---

**Goal:** `computeMatchScore(input: { job: JobExtraction; labels: MatchLabel[]; cvSeniority: Seniority | null; keptInferred: Set<string> }): MatchScore` under policy `match/1`, plus `bandOf(total: number): Band`.
- Components are an array of `{ id: "requirements" | "keywords" | "seniority" | "langEdu"; weight; compute(input) → { points: 0..1 } | null }`, where `null` means nothing to measure.
- Seniority: an exact level gives 1, one step away gives 0.5, otherwise 0, and `unknown` on either side gives `null`.
- `langEdu`: labels for requirements in the `language` and `education` categories (`null` when there are none).
- An inferred label that isn't in `keptInferred` counts as partial.

**Acceptance tests (exact values):**
- all met → 100 (`excellent`);
- one missing `must`, everything else met → total ≤ 69 and `capped: true`;
- `must` weighs 2× `nice`: 1 must met plus 1 nice missing, requirements only → requirements points = 2/3;
- `seniority: "unknown"` and no language/education requirements → weights 50/30 rescaled to 62.5/37.5;
- no requirements, keywords or seniority → `total: null`, `band: null`;
- bands: 85 → excellent, 84 → strong, 70 → strong, 69 → fair, 49 → low.

**Out of scope:** model calls.

## Task 5: Restore keeps newer notes

---
files: [apps/api/src/cv/routes.ts, apps/api/src/cv/repo.ts, apps/api/src/cv/supabase-repo.ts, apps/api/src/cv/memory-repo.ts, apps/api/test/cv-history.test.ts, supabase/migrations/20261108010000_restore_keeps_notes.sql, supabase/tests/database/baseline.test.sql]
new_files: [supabase/migrations/20261108010000_restore_keeps_notes.sql]
deps: false
size: 120
---

**Goal:** `POST /v1/cv/history/:id/restore` restores the version's text but keeps notes added since. The route loads the version and the current CV, builds `mergeNewerNotes(versionContent, current)` (Task 2), and calls a replaced `restore_base_cv(p_version_id uuid, p_expected_version int, p_content jsonb)`. That function still snapshots the current CV first and checks the version, then writes `p_content`, which must parse as `CvContent`.

**Acceptance tests:**
- `apps/api/test/cv-history.test.ts` (create it if missing, following the CV route tests): save, add a job note, restore an older version → the response has the older text and still contains the job note.
- pgTAP: restore still writes one snapshot and bumps the version.

**Out of scope:** the History UI.

## Task 6: Notes-only write for job answers

---
files: [supabase/migrations/20261108020000_add_job_notes.sql, supabase/tests/database/tailoring.test.sql, apps/api/src/cv/routes.ts, apps/api/src/cv/repo.ts, apps/api/src/cv/supabase-repo.ts, apps/api/src/cv/memory-repo.ts, apps/api/test/cv-notes.test.ts]
new_files: [supabase/migrations/20261108020000_add_job_notes.sql, apps/api/test/cv-notes.test.ts]
deps: false
size: 160
---

**Goal:**
- `add_job_notes(p_role_id text, p_notes jsonb) returns table(version int, updated_at timestamptz)`, `security invoker`, locking the user's `base_cvs` row. It appends the notes to that role, drops the oldest **job** notes beyond 25, bumps `version`, and writes **no** `base_cv_versions` row. If the role is missing, it raises `role_not_found` (P0002).
- Repo method `addJobNotes(roleId: string, notes: Note[]): Promise<{ version: number; updatedAt: string }>`. This is internal; Task 14 calls it, and there is no public route.

**Acceptance tests:**
- pgTAP: version +1, no new `base_cv_versions` row, a 26th job note drops the oldest job note, and another user's CV is untouched.
- `cv-notes.test.ts` against the memory repo: same cap and version behaviour.

**Out of scope:** the web.

## Task 7: Autosave merges a notes-only conflict silently, and role facts carry forward

---
files: [apps/web/src/cv/useAutosave.ts, apps/web/src/cv/useAutosave.test.ts, packages/shared/src/notes.ts, packages/shared/src/notes.test.ts, apps/api/src/enrich/focus-prompts.ts, apps/api/src/enrich/role-facts.test.ts]
new_files: []
deps: false
size: 130
---

**Goal:**
- Shared `onlyNotesDiffer(a: CvContent, b: CvContent): boolean`: true when the two are equal after removing every role's `notes` and `facts`.
- In `useAutosave`, on `version_conflict` (`useAutosave.ts:81`): load the latest CV. If `onlyNotesDiffer(latest.content, lastSavedByMe)`, retry the save with `mergeNewerNotes(mine, latest.content)` at the latest version, with no conflict banner. Otherwise keep today's behaviour.
- `roleFactsUserMessage` (`focus-prompts.ts:91`) also sends `<previous_facts>` (the role's `facts.items`) when present.

**Acceptance tests:**
- `useAutosave.test.ts`: a server change that only adds a note → the save succeeds, there's no conflict state, and the local text is kept. A server text change → conflict as before.
- `role-facts.test.ts`: the user message contains the previous facts.

**Out of scope:** anything else in the editor.

---

# Part 2: Score 1 and the job page (branch `rebuild/tailor-score`, on Part 1)

## Task 8: Cheap/strong model tier

---
files: [apps/api/src/ai/call-model.ts, apps/api/src/ai/call-model.test.ts, apps/api/src/ai/stream-model.ts, apps/api/src/env.ts, apps/api/.dev.vars.example]
new_files: []
deps: false
size: 80
---

**Goal:** `ModelRequest` gains `tier?: "cheap" | "strong"` (default `"cheap"`, which is today's behaviour). `providersFromEnv` reads `OPENROUTER_MODEL_STRONG` and `OPENAI_MODEL_STRONG` for `"strong"`, falling back to `OPENROUTER_MODEL` and `OPENAI_MODEL` when they're unset. Add both keys, empty, to `.dev.vars.example` with a one-line comment.

**Acceptance tests (`call-model.test.ts`):**
- `tier: "strong"` uses the strong model id;
- an unset strong key falls back;
- no tier uses the cheap model.

**Out of scope:** choosing actual model ids (the owner sets them).

## Task 9: Match labelling and Score 1 service

---
files: [apps/api/src/tailor/score.ts, apps/api/src/tailor/score.test.ts, apps/api/src/tailor/score-prompts.ts, apps/api/src/tailor/strip-header.ts, apps/api/src/tailor/strip-header.test.ts, apps/api/src/tailor/repo.ts, apps/api/src/tailor/memory-repo.ts, apps/api/src/tailor/supabase-repo.ts, apps/api/src/tailor/fake-model.ts]
new_files: [apps/api/src/tailor/score.ts, apps/api/src/tailor/score.test.ts, apps/api/src/tailor/score-prompts.ts, apps/api/src/tailor/strip-header.ts, apps/api/src/tailor/strip-header.test.ts, apps/api/src/tailor/repo.ts, apps/api/src/tailor/memory-repo.ts, apps/api/src/tailor/supabase-repo.ts, apps/api/src/tailor/fake-model.ts]
deps: false
size: 280
---

**Goal:**
- `stripHeader(cv: CvContent): { cv: CvContent; header: Basics }` blanks name, email, phone, address and links but keeps the headline. `restoreHeader(cv, header)` puts them back.
- `scoreMatch(deps, { userId, cv, job, keptInferred }): Promise<MatchScore>`:
  - calls `callModel` with task `tailor_score`, cheap tier, schema `{ labels: MatchLabel[] }`, on the stripped CV;
  - one label per requirement (`ref = "r<index>"`) and per keyword (`ref = "k:<term>"`, keywords taken from requirements and responsibilities);
  - a label marked `met` or `partial` whose `evidence` isn't a substring of the CV text is downgraded to `missing`;
  - returns `computeMatchScore(...)`.
- `TailorRepo` (this file grows in later tasks) starts with `saveScore(jobId, target, tailoredCvId | null, score)`, `getScore(jobId, target, tailoredCvId?)`, in memory and Supabase versions.

**Acceptance tests (`score.test.ts`, fake model):**
- the evidence check downgrades an invented quote;
- the header never appears in the model's user message;
- a fake model failure throws `ai_failed`.

**Out of scope:** routes and the worker hook.

## Task 10: Score 1 on job ready, job routes for thoughts, status and score

---
files: [apps/api/src/jobs/consumer.ts, apps/api/test/jobs-consumer.test.ts, apps/api/src/jobs/routes.ts, apps/api/src/jobs/repo.ts, apps/api/src/jobs/supabase-repo.ts, apps/api/src/jobs/memory-repo.ts, apps/api/test/jobs.test.ts, apps/api/src/app.ts, apps/api/src/index.ts]
new_files: []
deps: false
size: 180
---

**Goal:**
- After `admin.finish` sets `ready` (`consumer.ts:21`), compute Score 1 once with `scoreMatch` on the current Base CV and save it as target `base`. A score failure is logged and doesn't fail the job. A job that already has a base score isn't rescored.
- `GET /v1/jobs/:id/score` → `{ base: MatchScore | null, tailored: MatchScore | null }`.
- `PATCH /v1/jobs/:id` accepts `userThoughts` and `applicationStatus`.

**Acceptance tests:**
- `jobs-consumer.test.ts`: ready → one base score saved; a failing scorer → the job is still `ready`; a second finish → no second score.
- `jobs.test.ts`: the score route returns `base`; another user gets 404; the PATCH round-trips thoughts and status, and 2001 characters → 400.

**Out of scope:** Score 2.

## Task 11: Job page variant A

---
files: [apps/web/src/jobs/JobPage.tsx, apps/web/src/jobs/JobScoreCard.tsx, apps/web/src/jobs/JobThoughts.tsx, apps/web/src/jobs/TailorGate.tsx, apps/web/src/jobs/jobs-api.ts, apps/web/src/jobs/job-page.test.tsx, apps/web/src/jobs/job-score.test.tsx, apps/web/src/i18n/en-jobs.ts, apps/web/src/styles/jobs.css]
new_files: [apps/web/src/jobs/JobScoreCard.tsx, apps/web/src/jobs/JobThoughts.tsx, apps/web/src/jobs/TailorGate.tsx, apps/web/src/jobs/job-score.test.tsx]
deps: false
size: 290
---

**Goal:** the spec's "Job detail (A)" screen.
- `JobScoreCard`: total, band label, "N must-haves missing", and the requirement list with ✓/~/✗. Each missing `must` shows the honest next step: "If you have it, tailoring will ask about it. If not, mention related experience or treat it as a gap." "How is this scored?" toggles the component points.
- `JobThoughts`: a textarea (2000 max) with the mic, reusing `useVoice` (`apps/web/src/cv/enrich/useVoice.ts:77`) the way `AnswerBox` does. It saves on blur through `patchJob`.
- A status dropdown with the 6 statuses.
- **Tailor my CV**: when the job isn't `ready`, the button stays enabled and clicking it explains why. When the Base CV is weak (average role score < 60 or the newest role has no `facts`; constants `WEAK_AVG = 60`), `TailorGate` shows "Enrich first" / "Tailor anyway". Otherwise it navigates to `/jobs/:id/tailor`.
- Phone (<700 px): stacked with the score first, and the Tailor button sticky at the bottom.
- When the job has a tailored CV, the existing delete confirmation adds: "This also deletes its tailored CVs, translations and cover letters."

**Acceptance tests:**
- `job-page.test.tsx`: the delete dialog shows the extra line only when a tailored CV exists.
- `job-score.test.tsx`: renders the band and the missing musts; the toggle shows the points; `total: null` shows "This ad doesn't list enough to score".
- `job-page.test.tsx`: a weak CV shows the gate; a not-ready job explains why; thoughts are saved on blur.

**Out of scope:** the tailoring flow itself.

---

# Part 3: the tailoring flow (branch `rebuild/tailor-flow`, on Part 2)

## Task 12: Tailor run start and read

---
files: [apps/api/src/tailor/routes.ts, apps/api/src/tailor/start.ts, apps/api/src/tailor/language.ts, apps/api/src/tailor/language.test.ts, apps/api/src/tailor/repo.ts, apps/api/src/tailor/memory-repo.ts, apps/api/src/tailor/supabase-repo.ts, apps/api/test/tailor-start.test.ts, apps/api/src/app.ts, apps/api/src/index.ts]
new_files: [apps/api/src/tailor/routes.ts, apps/api/src/tailor/start.ts, apps/api/src/tailor/language.ts, apps/api/src/tailor/language.test.ts, apps/api/test/tailor-start.test.ts]
deps: false
size: 240
---

**Goal:**
- `POST /v1/jobs/:id/tailor { tone, instruction? (max 500) }` → `200 { run: TailorRun, tailoredCvId }`. It needs a `ready` job (otherwise 409 `job_not_ready`).
- The language is the job ad's language when it's one of the 6, otherwise the Base CV's locale. `detectAdLanguage(text: string): TailorLanguage | null` in `apps/api/src/tailor/language.ts` (+ test) counts common stopwords for each of the 6 languages in `extracted.summary` plus the responsibilities. It returns the top language when it leads the runner-up by at least 2× and has at least 5 hits, otherwise `null`. No model call.
- It creates `tailored_cvs` with `content = baseSnapshot = current Base CV` and `base_snapshot_at = now()`, plus a run with `kind: "tailor"`, `status: "running"` and `current_section: "experience"`.
- If a run is already `running` or `waiting_user` for this job and language, it returns that run with no new rows.
- `GET /v1/tailor-runs/:id` returns the run; a missing run or a deleted job → 404 `job_not_found`.
- Mount at `app.route` in `apps/api/src/app.ts:70`.

**Acceptance tests (`tailor-start.test.ts`):**
- start creates 1 tailored CV and 1 run;
- a second start returns the same ids (Review focus 1);
- a Dutch ad gives the Base CV locale (Review focus 2);
- a not-ready job → 409;
- another user → 404;
- a deleted job → 404 `job_not_found` (Review focus 4).

**Out of scope:** questions and passes.

## Task 13: Job questions and answers

---
files: [apps/api/src/tailor/questions.ts, apps/api/src/tailor/question-prompts.ts, apps/api/src/tailor/routes.ts, apps/api/test/tailor-questions.test.ts]
new_files: [apps/api/src/tailor/questions.ts, apps/api/src/tailor/question-prompts.ts, apps/api/test/tailor-questions.test.ts]
deps: false
size: 240
---

**Goal:**
- `POST /v1/tailor-runs/:id/sections/:section/questions` → `{ questions: Question[] }`:
  - task `tailor_questions`, cheap tier, built from that section's gaps (Score 1 labels that are `missing` or `partial`);
  - returns at most `8 − asked so far`;
  - never repeats a question whose meaning is already answered for this job, judged against the job notes with this `jobId` and the run's answers, both sent to the model, plus an exact-text check;
  - includes `confirm_inferred` questions ("We think you know X because of Y. Correct?").
- `POST /v1/tailor-runs/:id/answers { answers: Answer[] }`:
  - stores the answers in the run;
  - saves every non-skip answer as a job note through `addJobNotes` (Task 6), with `jobId`, and the note's existing "how it was given" field mapped from `via` (`option` → picked, `typed` → typed, `voice` → spoken), on the question's `roleId`. Skills and summary questions go on the newest role.

**Acceptance tests:**
- the cap stops at 8 across sections;
- an answered question isn't returned again in a later run for the same job;
- a skip creates no note;
- a voice answer creates a note with `via: "voice"`.

**Out of scope:** the rewrite.

## Task 14: Section pass with checks

---
files: [apps/api/src/tailor/section-pass.ts, apps/api/src/tailor/section-prompts.ts, apps/api/src/tailor/checks.ts, apps/api/src/tailor/checks.test.ts, apps/api/src/tailor/routes.ts, apps/api/test/tailor-section.test.ts]
new_files: [apps/api/src/tailor/section-pass.ts, apps/api/src/tailor/section-prompts.ts, apps/api/src/tailor/checks.ts, apps/api/src/tailor/checks.test.ts, apps/api/test/tailor-section.test.ts]
deps: false
size: 290
---

**Goal:** `POST /v1/tailor-runs/:id/sections/:section/run` → `{ proposals: Proposal[] }`.
- **Strong tier**, task `tailor_section`. The prompt carries the section of the stripped Base CV, the job, notes and facts for the roles involved, tone, instruction, and answers. It follows the spec's rules for each section: exact keywords, most relevant first, condense old or less relevant roles to 1–2 bullets, never remove a role, section or fact, and tag skills and wording as inferred.
- `checkProposal(p, ctx): Flag[]` in `checks.ts`, covering 3 code rules:
  - **number:** `hasUnknownNumber` (`packages/shared/src/enrich-checks.ts:176`) against the CV, notes and answers;
  - **entity:** employer, title and dates are unchanged;
  - **tool:** a tool or technology not in the source text and not tagged `inferred`.
- Rule **achievement** comes from a cheap-tier verifier call (`tailor_verify`) that returns new outcome claims per proposal.
- A flagged proposal is retried once with the flags in the prompt. Flags that remain are returned as `flag` questions.
- Unknown item ids are dropped. Items without a proposal keep the Base CV wording (Review focus 5).

**Acceptance tests:**
- `checks.test.ts`: an invented "30%" is flagged; a changed employer is flagged; "Kubernetes" untagged is flagged and tagged it passes.
- `tailor-section.test.ts` (fake model): retry once, then a flag question; an unknown id is dropped.

**Out of scope:** accepting.

## Task 15: Accept section, Score 2, layout step

---
files: [apps/api/src/tailor/accept.ts, apps/api/src/tailor/layout-pass.ts, apps/api/src/tailor/routes.ts, apps/api/test/tailor-accept.test.ts]
new_files: [apps/api/src/tailor/accept.ts, apps/api/src/tailor/layout-pass.ts, apps/api/test/tailor-accept.test.ts]
deps: false
size: 240
---

**Goal:** `POST /v1/tailor-runs/:id/sections/:section/accept { decisions: { itemId; keep: boolean }[], inferred: { itemId; keep: boolean }[], flags: { questionId; confirmed: boolean }[] }`.
- Writes the kept proposals into `tailored_cvs.content` (version +1) and the review state into `review`.
- A confirmed flag keeps the item and is saved as a job note. A rejected one reverts the item.
- Recomputes Score 2 with `scoreMatch` on the tailored content and kept inferred items, then saves it (target `tailored`).
- Moves `current_section` to the next one. After `languages`, the `layout` pass runs: section order plus a headline closer to the job title, using only terms found in the CV. After `layout`, the run is `done` and the job's `application_status` moves from `saved` to `tailored`.

**Acceptance tests:**
- accepting Experience changes only Experience;
- a rejected flag reverts;
- Score 2 is saved after each accept;
- the run ends `done` with status `tailored`;
- accepting a section that isn't current → 409.

**Out of scope:** web.

## Task 16: Web tailoring flow

---
files: [apps/web/src/tailor/TailorFlow.tsx, apps/web/src/tailor/SteeringStep.tsx, apps/web/src/tailor/QuestionCard.tsx, apps/web/src/tailor/SectionReview.tsx, apps/web/src/tailor/StepBar.tsx, apps/web/src/tailor/tailor-api.ts, apps/web/src/tailor/tailor-flow.test.tsx, apps/web/src/i18n/en-tailor.ts, apps/web/src/i18n/en.ts, apps/web/src/App.tsx, apps/web/src/styles/tailor.css]
new_files: [apps/web/src/tailor/TailorFlow.tsx, apps/web/src/tailor/SteeringStep.tsx, apps/web/src/tailor/QuestionCard.tsx, apps/web/src/tailor/SectionReview.tsx, apps/web/src/tailor/StepBar.tsx, apps/web/src/tailor/tailor-api.ts, apps/web/src/tailor/tailor-flow.test.tsx, apps/web/src/i18n/en-tailor.ts, apps/web/src/styles/tailor.css]
deps: false
size: 300
---

**Goal:** route `/jobs/:id/tailor`, a full-screen layout like focus mode, in one column (spec "Steering" and "Section flow (2A)").
- **Steering:** tone pills, an instruction box with mic, "Start · 5 sections".
- **Step bar:** the sections plus "Score <base>→<latest>".
- **Per section:** question cards (options, typed, voice, confirm inferred, Skip, Skip all), then the run, then flag cards, then review (keep/revert per item, Keep/Remove for inferred, Revert all, Accept section).
- **Resume:** reopening the route loads the run and continues at `current_section`.
- **Errors:** an AI failure shows "Couldn't tailor <section>. Try again" and keeps progress; a 404 `job_not_found` shows "This job was deleted".
- **Done:** navigates to `/jobs/:id/cv`.

**Acceptance tests (`tailor-flow.test.tsx`, `tailor-api` mocked):**
- full happy path through 2 sections;
- Skip all goes straight to the run;
- the score in the step bar updates after accept;
- a reload resumes at section 2;
- `job_not_found` shows the deleted message.

**Out of scope:** the editor view.

---

# Part 4: Tailored CV editor, re-tailor, translate (branch `rebuild/tailor-editor`, on Part 3)

## Task 17: Tailored CV read and save

---
files: [apps/api/src/tailor/tailored-routes.ts, apps/api/src/tailor/repo.ts, apps/api/src/tailor/memory-repo.ts, apps/api/src/tailor/supabase-repo.ts, apps/api/test/tailored.test.ts, apps/api/src/app.ts]
new_files: [apps/api/src/tailor/tailored-routes.ts, apps/api/test/tailored.test.ts]
deps: false
size: 200
---

**Goal:**
- `GET /v1/jobs/:id/tailored` → the list of `{ id, language, translatedFrom, updatedAt }`.
- `GET /v1/tailored/:id` → `TailoredCv`.
- `PUT /v1/tailored/:id { content, expectedVersion }` → the same version-check behaviour and `version_conflict` 409 shape as `PUT /v1/cv`.
- `PATCH /v1/tailored/:id { template }`.

**Acceptance tests:**
- round-trip;
- conflict on a stale version;
- another user → 404;
- invalid content → 400.

**Out of scope:** web.

## Task 18: Editor works on a tailored document

---
files: [apps/web/src/cv/Editor.tsx, apps/web/src/cv/panel/HelperPanel.tsx, apps/web/src/cv/panel/SectionTools.tsx, apps/web/src/cv/panel/Overview.tsx, apps/web/src/tailor/TailoredCvPage.tsx, apps/web/src/tailor/TailorToolbar.tsx, apps/web/src/tailor/tailored-api.ts, apps/web/src/tailor/tailored-page.test.tsx, apps/web/src/cv/page/CvDocument.tsx, apps/web/src/App.tsx, apps/web/src/i18n/en-tailor.ts]
new_files: [apps/web/src/tailor/TailoredCvPage.tsx, apps/web/src/tailor/TailorToolbar.tsx, apps/web/src/tailor/tailored-api.ts, apps/web/src/tailor/tailored-page.test.tsx]
deps: false
size: 300
---

**Goal:**
- `Editor` takes `source: { load(): Promise<CvResponse>; save(content, version) }` (today it's fixed to `getCv`/`saveCv` at `Editor.tsx:36`) and `mode: "base" | "tailored"`.
- In `tailored` mode, `HelperPanel` hides every enrichment tool (`SectionTools.tsx:149,154,155`, `Overview.tsx:101`), shows "Was: <base wording>" and **Use original wording** for the selected item, and hides History.
- `CvDocument` takes an optional `highlights: Set<itemId>` and `inferred: Set<itemId>`, which show the green and amber marks.
- `TailoredCvPage` at `/jobs/:id/cv`: tabs CV | Cover letter (the letter is a placeholder until Task 22); the toolbar shows "Score <1> → <2> · <band>", Template ▾, Language ▾ Translate, Re-tailor… and Export ▾ (wired in Part 6); a ↻ per section.

**Acceptance tests:**
- `tailored-page.test.tsx`: no "Improve with AI" control; Use original wording restores the base text; highlights render; autosave calls the tailored save.
- The existing editor tests still pass in base mode.

**Out of scope:** re-tailor and translate actions (Tasks 19–20).

## Task 19: Re-tailor and job-changed notice

---
files: [apps/api/src/tailor/retailor.ts, apps/api/src/tailor/tailored-routes.ts, apps/api/test/tailor-retailor.test.ts, apps/web/src/tailor/RetailorDialog.tsx, apps/web/src/tailor/TailoredCvPage.tsx, apps/web/src/tailor/retailor.test.tsx, apps/web/src/i18n/en-tailor.ts]
new_files: [apps/api/src/tailor/retailor.ts, apps/api/test/tailor-retailor.test.ts, apps/web/src/tailor/RetailorDialog.tsx, apps/web/src/tailor/retailor.test.tsx]
deps: false
size: 220
---

**Goal:**
- `POST /v1/tailored/:id/retailor { sections: TailorSection[] }` starts a run (`kind: "retailor"`, or `"section"` when there's one section) covering only those sections, using the same question, pass and accept routes. Sections that aren't picked are untouched.
- The web: a section checklist dialog, the ↻ per section (it skips the dialog), and the run opens `TailorFlow` limited to those sections.
- The notice "The job changed. Re-tailor?" shows when `job.updatedAt > tailoredCv.createdAt` and the job was edited by the user.

**Acceptance tests:**
- re-tailoring Skills leaves Experience byte-identical;
- previously answered questions aren't asked;
- the notice appears after a job edit and not before.

**Out of scope:** translation.

## Task 20: Translate into an independent copy

---
files: [apps/api/src/tailor/translate.ts, apps/api/src/tailor/translate-prompts.ts, apps/api/src/tailor/tailored-routes.ts, apps/api/test/tailor-translate.test.ts, apps/web/src/tailor/TailorToolbar.tsx, apps/web/src/tailor/translate.test.tsx]
new_files: [apps/api/src/tailor/translate.ts, apps/api/src/tailor/translate-prompts.ts, apps/api/test/tailor-translate.test.ts, apps/web/src/tailor/translate.test.tsx]
deps: false
size: 220
---

**Goal:** `POST /v1/tailored/:id/translate { language }`, strong tier, task `tailor_translate`.
- Creates the `(job_id, language)` copy with `translated_from = id`, or refreshes it if it exists.
- Runs the Task 14 checks on the result.
- Translates the cover letter when there is one.
- Never changes the original.
- The web: the Language ▾ menu lists existing copies (open) and missing ones (Translate); "Translate again" asks first because it replaces the copy's edits.

**Acceptance tests:**
- the copy exists and the original is unchanged;
- a second call refreshes the same row;
- translating to the original's own language → 400.

**Out of scope:** export.

---

# Part 5: cover letter (branch `rebuild/tailor-letter`, on Part 4)

## Task 21: Cover letter API

---
files: [apps/api/src/tailor/letter.ts, apps/api/src/tailor/letter-prompts.ts, apps/api/src/tailor/tailored-routes.ts, apps/api/test/tailor-letter.test.ts]
new_files: [apps/api/src/tailor/letter.ts, apps/api/src/tailor/letter-prompts.ts, apps/api/test/tailor-letter.test.ts]
deps: false
size: 200
---

**Goal:**
- `POST /v1/tailored/:id/cover-letter { whyCompany?: string(max 1000), hiringManager?: string(max 120) }`, strong tier, task `tailor_letter`. Inputs: the tailored content (stripped), the job and the user's thoughts. Output: the body only, 3–4 paragraphs, 250–350 words.
- Task 14's checks run on the body; a flagged letter is retried once, and remaining flags are returned with the letter.
- Saves `cover_letter`. Regenerating replaces it.
- `PUT /v1/tailored/:id/cover-letter { body }` saves edits (max 4000 characters).

**Acceptance tests:**
- the body word count is within 200–400 with the fake model's sample;
- the header never goes to the model;
- an invented number gets flagged;
- regenerate replaces.

**Out of scope:** the letter header rendering (web).

## Task 22: Cover letter tab

---
files: [apps/web/src/tailor/CoverLetterTab.tsx, apps/web/src/tailor/LetterPage.tsx, apps/web/src/tailor/TailoredCvPage.tsx, apps/web/src/tailor/tailored-api.ts, apps/web/src/tailor/cover-letter.test.tsx, apps/web/src/i18n/en-tailor.ts]
new_files: [apps/web/src/tailor/CoverLetterTab.tsx, apps/web/src/tailor/LetterPage.tsx, apps/web/src/tailor/cover-letter.test.tsx]
deps: false
size: 240
---

**Goal:** the spec's "Cover letter tab".
- `LetterPage` renders the app-added parts: name and contact from the Base CV header, the date in the letter's language (`Intl.DateTimeFormat(locale, { dateStyle: "long" })`), "Re: <role>, <company>", the greeting ("Dear <name>," or "Dear Hiring Team,", translated), the body, and "Kind regards," plus the name.
- The side area has the optional "Why <company>?" with mic, the hiring manager field, "Uses your thoughts on the role ✓", Write letter, and Regenerate (confirms that it replaces your edits).
- The body is editable with autosave.

**Acceptance tests:**
- the empty state shows Write letter;
- the header and greeting render with and without a manager name;
- Regenerate asks first;
- the date is formatted for `de`.

**Out of scope:** export.

---

# Part 6: export, templates, photo, eval (branch `rebuild/tailor-export`, on Part 5)

## Task 23: Template registry with Classic, Modern, Compact

---
files: [apps/web/src/cv/page/templates.ts, apps/web/src/cv/page/CvDocument.tsx, apps/web/src/cv/page/templates.css, apps/web/src/cv/page/templates.test.tsx, apps/web/src/tailor/TailorToolbar.tsx]
new_files: [apps/web/src/cv/page/templates.ts, apps/web/src/cv/page/templates.css, apps/web/src/cv/page/templates.test.tsx]
deps: false
size: 220
---

**Goal:**
- `TEMPLATES: { id: "classic" | "modern" | "compact"; label; className; showsPhoto: boolean }[]`. All three are single-column. Classic is a serif, Modern a clean sans with an accent, Compact a tighter spacing.
- `CvDocument` takes `template` and applies the class. Adding a template means one entry plus CSS.
- The toolbar dropdown switches live and saves through `PATCH /v1/tailored/:id`.

**Acceptance tests:**
- each template renders the same text content;
- switching calls the PATCH;
- an unknown id falls back to classic.

**Out of scope:** files.

## Task 24: PDF export in the browser

---
files: [apps/web/src/export/pdf.ts, apps/web/src/export/print.css, apps/web/src/export/file-name.ts, apps/web/src/export/file-name.test.ts, apps/web/src/export/ExportMenu.tsx, apps/web/src/export/export.test.tsx, apps/web/src/tailor/TailorToolbar.tsx]
new_files: [apps/web/src/export/pdf.ts, apps/web/src/export/print.css, apps/web/src/export/file-name.ts, apps/web/src/export/file-name.test.ts, apps/web/src/export/ExportMenu.tsx, apps/web/src/export/export.test.tsx]
deps: false
size: 200
---

**Goal:**
- **PDF method (owner choice, 2026-11-08): a one-click download, built in the browser with a client PDF library.**
  - Before this task, Claude runs a Codex `scout` comparing 2–3 libraries on: selectable text (ATS), A4, embedding the self-hosted fonts (Newsreader, Instrument Sans), bundle size, licence, and whether it can render from the same content as `CvDocument`.
  - Claude picks one, pins its exact version, and tells the owner in one line. The task then has `deps: true`, and `apps/web/package.json` plus `package-lock.json` join its files.
  - `exportPdf(kind: "cv" | "letter"): Promise<void>` downloads the file directly.
- `exportFileName(name, company, role, ext)`: diacritics are removed with NFD, spaces become `_`, anything outside `[A-Za-z0-9_]` is dropped, and the parts are joined with `_`, e.g. `Ana_Popescu_Bolt_Senior_Backend_Engineer.pdf`. The download uses that name.
- The export menu warns when inferred items are still unreviewed (it lists them) and allows export anyway. Tags never print.

**Acceptance tests:**
- `file-name.test.ts`: `Ștefan Ionescu` → `Stefan_Ionescu_…` (Review focus 3), and `R&D / QA` → `RD_QA`.
- `export.test.tsx`: the warning lists 2 unreviewed items and Export still calls `exportPdf`.

**Out of scope:** DOCX.

## Task 25: DOCX export

---
files: [apps/web/package.json, package-lock.json, apps/web/src/export/docx.ts, apps/web/src/export/docx.test.ts, apps/web/src/export/ExportMenu.tsx]
new_files: [apps/web/src/export/docx.ts, apps/web/src/export/docx.test.ts]
deps: true
size: 220
---

**Goal:** add `docx` (exact version pinned, as with the other dependencies). `buildCvDocx(content: CvContent, template): Promise<Blob>` and `buildLetterDocx(letter, header, locale): Promise<Blob>` write A4 pages, all sections in layout order with the user's headings, and the photo when the template shows it. The download uses `exportFileName(..., "docx")`.

**Acceptance tests (`docx.test.ts`):**
- the blob unzips to a `word/document.xml` containing the name, every role title and every bullet text;
- hidden sections are absent.

**Out of scope:** templates beyond basic styling per template.

## Task 26: Photo in the Base CV header

---
files: [supabase/migrations/20261108030000_cv_photos.sql, supabase/tests/database/cv-photos.test.sql, packages/shared/src/cv.ts, packages/shared/src/cv.test.ts, apps/web/src/cv/panel/PhotoField.tsx, apps/web/src/cv/panel/photo.test.tsx, apps/web/src/cv/page/CvDocument.tsx, apps/web/src/i18n/en.ts]
new_files: [supabase/migrations/20261108030000_cv_photos.sql, supabase/tests/database/cv-photos.test.sql, apps/web/src/cv/panel/PhotoField.tsx, apps/web/src/cv/panel/photo.test.tsx]
deps: false
size: 240
---

**Goal:**
- A private bucket `cv-photos`. Storage RLS allows a user to read and write only `<auth.uid()>/…`. Files are images up to 2 MB (jpeg, png, webp).
- `BasicsSchema` gains `photo: { path: string; x: number; y: number; zoom: number(1–3) } | null` (optional, upgraded as null).
- `PhotoField` in the header editor handles upload, position (drag) and zoom (slider), and Remove.
- `CvDocument` shows the photo through a signed URL when `template.showsPhoto`.
- **The photo is never sent to any AI.**

**Acceptance tests:**
- pgTAP: user B can't read A's photo object;
- `cv.test.ts`: zoom 4 is rejected;
- `photo.test.tsx`: upload then zoom updates the content; Remove clears it.

**Out of scope:** photo editing beyond position and zoom.

## Task 27: Tailoring eval set and score stability

---
files: [apps/api/eval/tailor/run.ts, apps/api/eval/tailor/fixtures.json, apps/api/eval/tailor/README.md, apps/api/package.json]
new_files: [apps/api/eval/tailor/run.ts, apps/api/eval/tailor/fixtures.json, apps/api/eval/tailor/README.md]
deps: false
size: 250
---

**Goal:** like `apps/api/eval/enrich`, with 6 fictional CV-plus-job pairs (EN, RO, a career switcher, a long career over 2 pages, a weak CV, a non-matching job).
- `npm run eval:tailor` runs the full pipeline on real keys and reports:
  - invented facts, which must be **0**: numbers or employers not in the source;
  - keyword coverage before and after;
  - the Score 1 → 2 lift;
  - cost per run, which must be **< $0.05** without the letter;
  - pages after export, which must be ≤ 2.
- It also scores each pair 3× and fails when the spread is > 3.
- Results are written to `RESULTS.md`. Fixtures come from a Codex `-Free` scout, reviewed by Claude, fictional people only.

**Acceptance tests:** the script type-checks and runs against the fake model in CI mode (`--fake`) with all checks passing.

**Out of scope:** the manual Chrome pass. Claude does that with the owner after Task 27, in the owner's signed-in Chrome.
