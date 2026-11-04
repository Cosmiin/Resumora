# Base CV enrichment: experience scores, questions and rewrites — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every experience a visible 0–100 score with tips, let the person answer up to 3 questions and accept AI-rewritten bullets one by one, and add summary and skills checklists with AI helpers. All of it lives in the editor panel, and no invented facts are allowed.

**Architecture:**
- The model returns categorical grades; `packages/shared/src/enrich.ts` computes every number.
- Scores are a cache in a new `cv_insights` table, keyed by a text fingerprint.
- The person's answers are hidden `notes` inside the CV itself.
- The API reads the **saved** CV, calls `callModel`, and returns proposals.
- The browser applies the accepted proposals through `cvReducer`, so undo, autosave and History cover AI changes for free.

**Tech Stack:** Cloudflare Worker (Hono), Supabase (Postgres + RLS), zod 4, vitest, React 19, `callModel` (OpenRouter `google/gemini-3.1-flash-lite`, then OpenAI `gpt-5.4-mini`).

**Spec:** `docs/superpowers/specs/2026-11-05-base-cv-enrichment-design.md` (binding). Scoring prompt source material: `docs/superpowers/specs/reference/codex-experience-scoring.md` (Appendix C).
**Depends on:** Plans A–C on `rebuild/perfect-cv`. It uses `cvReducer`, `SectionTools`, `EditablePage`, `useAutosave` (`status: "saved" | …`), `HistoryItem.reason` (already includes `"ai"`), `callModel`, `cv.locale: "en" | "ro"`, and `BulletSchema = { id, text }`.

## Global Constraints

- Run Node from Git Bash with `export PATH="/c/Program Files/nodejs:$PATH";` first.
- Before every commit, from the repo root: `npm run lint && npm run typecheck && npm test`.
- Plain words in code: never "fence", "receipt", "settlement", "provenance", "lease".
- Always `git add` explicit paths, and check `git diff --cached --name-only`. Never stage `AGENTS.md`, `docs/decisions/0001–0008`, `docs/learning/`, or the architecture-companion spec and plan.
- Commit subjects: conventional, one line, followed by a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Secrets live only in `apps/api/.dev.vars` and `apps/web/.env.local`. Never print them. The eval reads keys from `.dev.vars`.
- Every model call goes through `callModel`. Task names: `enrich_score`, `enrich_rewrite_role`, `enrich_rewrite_summary`, `enrich_skills`.
- Every enrich route reads the saved CV on the server and never trusts CV text sent by the browser.
- Weights are exactly contribution **35**, clarity **25**, specificity **20**, impact **20**. Multipliers: missing 0, partial 0.5, specific 1. Rounding is `Math.round`. Policy id: `score/1`.
- Bands: 0–39 "Needs work", 40–74 "A good start", 75–100 "Clear". "Clear bullet" means a score of 75 or more.
- Limits: at most 3 questions per role; at most 10 notes per role; proposals ≤ 220 characters; one score request in flight at a time; re-score 2 s after a save.
- UI strings go in `apps/web/src/i18n/en.ts`. AI output and questions are in the CV's locale.
- No ↑↓ arrows anywhere. Notes are never rendered on the page, in `CvDocument`, or in the PDF.
- Keep files under ~300 lines.

## Review Focus

1. **A role is edited while its score request is in flight.** The late result must be ignored, not shown against the new text → test in Task 8.
2. **A bullet that a proposal replaces is deleted before the person clicks "Use this".** The proposal is skipped, and nothing else changes → test in Task 10.
3. **Numbers written differently in the source and the proposal.** "1.2M" against "1,2 mil", or "20 min" against "20 minutes", must pass. A number that appears nowhere must drop the proposal → tests in Task 2.
4. **A Romanian CV.** First-person words in Romanian are caught, and questions and rewrites come back in Romanian → tests in Task 2, plus eval cases in Task 12.
5. **The model grades a bullet id that wasn't sent, or skips one.** The call fails as a 502 and never stores a partial score. A placeholder bullet the model calls "specific" still scores 0 → tests in Tasks 1 and 5.

---

### Task 1: Scoring core in the shared package

**Files:**
- Create: `packages/shared/src/enrich.ts`, `packages/shared/src/enrich.test.ts`
- Modify: `packages/shared/src/index.ts` (export it)

**Interfaces:**
- Produces:
  - `SCORE_POLICY = "score/1"`, `WEIGHTS = { contribution: 35, clarity: 25, specificity: 20, impact: 20 }`.
  - `GradeSchema = z.enum(["missing","partial","specific"])`.
  - `IssueSchema = z.enum(["example","duplicate","contribution","clarity","specificity","impact","none"])`.
  - `ModelBulletSchema = { id, meaningful: boolean, contribution, clarity, specificity, impact: Grade, issue: Issue, duplicateOf: string|null, tip: string(≤240)|null, question: string(≤240)|null }`.
  - `ModelScoreSchema = { bullets: ModelBullet[], nextStepId: string|null }`.
  - `RoleResultSchema = { policy, fingerprint, score: number|null, bullets: [{ id, score, contribution, clarity, specificity, impact, issue, tip: string|null, question: string|null }], nextStep: { bulletId, issue, tip: string|null } | null, questions: string[] (max 3) }`.
  - `bulletScore(g): number`.
  - `isPlaceholder(text: string): boolean`.
  - `buildRoleResult(role: Experience, model: ModelScore, fingerprint: string): RoleResult`. It throws `EnrichParseError` when the model's ids don't match the role's bullet ids exactly.
  - `fingerprint(role: Experience, locale: Locale): string`.
  - `band(score: number): "needsWork" | "goodStart" | "clear"`.
  - `clearCount(result): { clear: number; total: number }`.

- [ ] **Step 1: Write failing tests** in `enrich.test.ts`:
  - `bulletScore`:
    - all specific = 100;
    - specific/specific/specific/missing = 80;
    - partial/specific/missing/missing = 43;
    - partial/specific/partial/partial = 63;
    - missing/partial/missing/partial = 23.
  - `isPlaceholder`:
    - true for `""`, `"  "`, `"TODO"`, `"tbd."`, `"Lorem ipsum dolor"`, `"asdf"`, `"test"`;
    - false for `"Tested payroll exports"`.
  - `buildRoleResult`, with three cases:
    - a placeholder bullet graded all-specific by the model gets score 0 and issue `example`;
    - an exact repeat (case and spacing differ) gets score 0 and issue `duplicate`;
    - a `duplicateOf` that points at a *later* id is ignored.
  - Issue normalisation: grades partial/specific/specific/specific with model issue `impact` become issue `contribution`, and `tip` and `question` become null.
  - Role score = rounded mean of [100, 80, 0] = 60.
  - A role with 0 bullets gives `score: null`, `questions: []`.
  - `questions`:
    - at most 3;
    - ordered by issue priority (example, duplicate, contribution, clarity, specificity, impact), then by lower score;
    - non-null only;
    - duplicates never ask.
  - `nextStep`:
    - the model's `nextStepId` is used when that bullet's issue is in the highest-priority tier present;
    - otherwise the lowest-scoring bullet of that tier;
    - null when every issue is `none`.
  - Ids: an unknown id, or a missing id, throws `EnrichParseError`.
  - `fingerprint` is stable for the same input, and changes when a bullet's text, the description, the title, the locale or `SCORE_POLICY` changes. It does not change when only `company` or dates change.
  - `band`: 39 → needsWork, 40 → goodStart, 74 → goodStart, 75 → clear.
- [ ] **Step 2: Run** `npm test -w packages/shared -- enrich`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement.**
  - `fingerprint` hashes `[SCORE_POLICY, locale, title, description, ...bullet texts].join("\u0000")` with a small synchronous 53-bit string hash (cyrb53), written as hex. It has to be synchronous so the browser and the worker share it.
  - `isPlaceholder` lowercases, strips accents (`normalize("NFD")` and removing combining marks) and strips punctuation. It is true for an empty result, or when the text equals or starts with one of: `placeholder, test, testing, todo, tbd, asdf, lorem ipsum, nothing special, de completat, exemplu, nimic`.
- [ ] **Step 4: Run** the same tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(shared): experience score grades and arithmetic`.

### Task 2: ATS tips, checklists and the numbers check

**Files:**
- Create: `packages/shared/src/enrich-checks.ts`, `packages/shared/src/enrich-checks.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Produces:
  - `AtsTip = "tooLong" | "firstPerson" | "missingDates" | "missingTitle" | "fewBullets" | "manyBullets" | "oddCharacters"`.
  - `atsChecks(role: Experience): AtsTip[]`, in that order.
  - `SummaryCheck = { key: "sentences" | "firstPerson" | "length" | "mentionsRole" | "mentionsNumber"; ok: boolean }`.
  - `summaryChecklist(cv: CvContent): SummaryCheck[]`.
  - `SkillsCheck = { key: "nothingToSort" | "toolsListed"; ok: boolean; missing?: string[] }`.
  - `skillsChecklist(cv: CvContent): SkillsCheck[]`.
  - `numbersIn(text: string): string[]` (normalised).
  - `hasUnknownNumber(proposal: string, sources: string[]): boolean`.
  - `PROPOSAL_MAX = 220`.

- [ ] **Step 1: Write failing tests:**
  - `atsChecks`:
    - a 221-character bullet → `tooLong`;
    - `"I managed payroll"` and `"Am coordonat echipa mea"` → `firstPerson` (`"I"` and `"mea"` are matched at word boundaries; `"Iași"` does not match);
    - an empty `startDate` → `missingDates`;
    - `current: false` with an empty `endDate` → `missingDates`;
    - an empty title → `missingTitle`;
    - 1 bullet → `fewBullets`;
    - 9 bullets → `manyBullets`;
    - a bullet with "★" or "✓" or a tab → `oddCharacters`;
    - a clean role → `[]`.
  - `summaryChecklist`:
    - 2–4 sentences pass, 1 or 5 fail;
    - "I"/"my"/"eu"/"meu" fail `firstPerson`;
    - more than 600 characters fails `length`;
    - `mentionsRole` passes when the summary contains the latest role's title, or any word of it with 4 or more letters, case-insensitive;
    - `mentionsNumber` passes when the summary contains a digit.
  - `skillsChecklist`:
    - `nothingToSort` fails when `unclearSkills` is non-empty;
    - `toolsListed` lists capitalised tokens or known tool-like words that appear in at least one experience bullet but in no skills group. It is a simple heuristic. A word counts as a tool when it is all caps with 2–6 letters (`SQL`), has a capital or digit after its first letter (`GA4`, `PowerBI`), or contains a dot between letters (`Node.js`). It ignores words in a small stop list (`CV`, `HR`, `CEO`, `EU`, `RO`, `UK`, `USA`, `PM`). Test with a bullet "Built reports in SQL and PowerBI for the HR team", where SQL and PowerBI are missing from skills, so `missing` = `["SQL", "PowerBI"]`.
  - `hasUnknownNumber`:
    - false for proposal `"Cut onboarding to 20 minutes"` with source `"from 3 days to 20 min"`;
    - false for `"for 1.2M customers"` with source `"1,2 mil clienți"`;
    - false for `"by 30%"` with source `"30 %"`;
    - true for `"by 30%"` with source `"improved a lot"`;
    - true for `"for 12 clients"` with source `"for 120 clients"`.
- [ ] **Step 2: Run** `npm test -w packages/shared -- enrich-checks`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `numbersIn` extracts numbers with an optional decimal separator (`.` or `,`) and normalises the separator to `.`.
  - It maps scale suffixes `k`/`mii` → ×1 000 and `M`/`mil`/`million`/`milioane` → ×1 000 000 to a plain number string. It drops `%` and units.
  - A proposal number is known when it equals any source number.
- [ ] **Step 4: Run** again. Expected: PASS.
- [ ] **Step 5: Commit** `feat(shared): ATS tips, summary and skills checklists, numbers check`.

### Task 3: Notes on each role, and carrying them over on re-import

**Files:**
- Modify: `packages/shared/src/cv.ts` (`NoteSchema`, `MAX_NOTES = 10`, `notes` on `ExperienceSchema`), `packages/shared/src/upgrade.ts` if it builds experiences
- Create: `packages/shared/src/notes.ts`, `packages/shared/src/notes.test.ts`
- Modify: `apps/web/src/cv/edit/cvReducer.ts` and its test (`setNote`)

**Interfaces:**
- Produces:
  - `NoteSchema = { id, question: text(MAX_TEXT), answer: text(MAX_LONG_TEXT), askedAt: z.iso.datetime() }`.
  - `Experience.notes: Note[]`, defaulting to `[]`, max `MAX_NOTES`.
  - `carryNotes(current: CvContent, incoming: CvContent): CvContent`. Notes of each current role whose `company` and `title` (trimmed, lowercased, spaces collapsed) match exactly one incoming role are copied onto it. Incoming notes win on equal ids. The result is capped at `MAX_NOTES`, keeping the newest by `askedAt`.
  - Reducer action `{ type: "setNote"; roleId: string; note: Note }`, which inserts or replaces by `note.id`.

- [ ] **Step 1: Write failing tests:**
  - a stored CV without `notes` parses with `notes: []` (through the same path `GET /v1/cv` uses);
  - 11 notes fail validation;
  - `carryNotes` copies notes when company and title match ignoring case and spaces;
  - `carryNotes` skips a role whose match is ambiguous (two incoming roles with the same company and title);
  - `carryNotes` leaves unmatched incoming roles unchanged;
  - reducer `setNote` adds, then replaces, by id;
  - the read-only `CvDocument` renders no note text (render a CV with a note whose answer is `"SECRET-NOTE"` and assert it is absent).
- [ ] **Step 2: Run** `npm test -w packages/shared -- notes` and `npm test -w apps/web -- cvReducer`. Expected: FAIL.
- [ ] **Step 3: Implement.** Use `.default([])` so old CVs load with no migration (`content` is jsonb). Every place that creates an empty experience (reducer `addRole`, the import mapping) sets `notes: []`.
- [ ] **Step 4: Run** the full check. Expected: green, with old fixtures still passing.
- [ ] **Step 5: Commit** `feat(shared): notes on each role, kept across re-imports`.

### Task 4: Database: `cv_insights`, the History copy before AI changes, and AI call logging from requests

**Files:**
- Create: `supabase/migrations/20261106000000_enrichment.sql`
- Create: `apps/api/src/enrich/repo.ts`, `apps/api/src/enrich/memory-repo.ts`, `apps/api/src/enrich/supabase-repo.ts`
- Modify: `apps/api/src/cv/repo.ts`, `cv/memory-repo.ts`, `cv/supabase-repo.ts` (add `snapshot`)
- Test: `apps/api/src/enrich/repo.test.ts`, and the existing cv repo tests

**Interfaces:**
- Produces:
  - `InsightsRepo { list(): Promise<RoleResult[]>; get(roleId): Promise<RoleResult | null>; put(roleId, result): Promise<void>; remove(roleIds: string[]): Promise<void> }`, always scoped to the signed-in user.
  - `CvRepo.snapshot(reason: "ai"): Promise<void>`, which copies the current saved CV into history with that reason. Same 50-row limit.
  - `logAiCall(entry: AiCallLog)` for request handlers, via the RPC below.
- **Migration:**
  - Table `public.cv_insights(user_id uuid not null references auth.users on delete cascade, role_id text not null, fingerprint text not null, policy text not null, result jsonb not null, updated_at timestamptz not null default now(), primary key (user_id, role_id))`.
  - RLS enabled.
  - Policies "own insights: read / create / update / delete", each with `user_id = (select auth.uid())`.
  - `revoke all … from anon`.
  - Grant `select, insert, update, delete` to `authenticated`.
  - Function `public.snapshot_base_cv(p_reason text)`: `security definer`, `set search_path = ''`, rejects any reason other than `'ai'`, inserts from the caller's own `base_cvs` row, then trims to 50, following the snapshot code in the baseline `save_base_cv`.
  - Function `public.log_ai_call(p_task text, p_provider text, p_model text, p_status text, p_error text, p_duration_ms int, p_input_tokens int, p_output_tokens int)`: `security definer`, sets `user_id := auth.uid()` (never a passed id) and inserts into `ai_calls`.
  - Grant execute on both to `authenticated` only.

- [ ] **Step 1: Write failing tests** with the memory repos: `put` then `get` round-trips; `list` returns only this user's rows; `remove` deletes the given ids; `snapshot("ai")` adds a history item with reason `ai` and keeps 50.
- [ ] **Step 2: Run** `npm test -w apps/api -- repo`. Expected: FAIL.
- [ ] **Step 3: Implement** the memory and Supabase repos and the migration. The Supabase insights repo upserts on `(user_id, role_id)`. Validate `result` with `RoleResultSchema` on read, and drop rows that fail.
- [ ] **Step 4: Run** the full check. Expected: green.
  - Do **not** apply the migration to the hosted project. Write `docs/superpowers/plans/2026-11-05-enrichment-db-steps.md` with the exact `supabase db push` command for the user to run.
- [ ] **Step 5: Commit** the migration, repos, tests and steps file: `feat(api): cv_insights table, AI history copy, AI call logging for requests`.

### Task 5: Score route and prompt

**Files:**
- Create: `apps/api/src/enrich/prompts.ts`, `apps/api/src/enrich/score.ts`, `apps/api/src/enrich/routes.ts`, `apps/api/src/enrich/score.test.ts`, `apps/api/src/enrich/routes.test.ts`
- Modify: `apps/api/src/app.ts` (add `insightsRepo(user)` and `model(user): ModelDeps` to `AppDeps`; mount `/v1/enrich`), `apps/api/src/index.ts` (real deps: `providersFromEnv(env)`, `logCall` → `log_ai_call` RPC as the user), and the test app factory

**Interfaces:**
- Consumes: Task 1 (`ModelScoreSchema`, `buildRoleResult`, `fingerprint`, `SCORE_POLICY`) and Task 4 (`InsightsRepo`, `CvRepo`).
- Produces:
  - `GET /v1/enrich/scores` → `{ items: RoleResult[] }`.
  - `POST /v1/enrich/score { roleId: string, fingerprint: string }` → `RoleResult`.
  - Errors:
    - 404 `role_not_found` when `roleId` isn't in the saved CV;
    - 409 `not_saved` when the saved role's fingerprint ≠ the one sent;
    - 503 on `AiUnavailableError`;
    - 502 `ai_bad_answer` when `buildRoleResult` throws after `callModel`'s own retries.
  - `scoreSystemPrompt(locale)` and `scoreUserMessage(role)` in `prompts.ts`.
  - Web Zod schemas for these responses come from shared.

- [ ] **Step 1: Write failing tests**, using a fake model function:
  - a cached row with the same fingerprint and policy → no model call;
  - an absent row → one model call with task `enrich_score`, `temperature` unchanged at 0, and the result is stored;
  - a stale fingerprint sent → 409 `not_saved`, no call;
  - a role with 0 bullets → `score: null`, no call;
  - the model returns an extra or missing id → 502, nothing stored;
  - `GET /scores` returns the user's rows;
  - the score route removes insight rows for role ids no longer in the saved CV;
  - `scoreUserMessage` contains the title and description marked as context only, and every bullet as `{ id, text }`, and it contains no company name or dates.
- [ ] **Step 2: Run** `npm test -w apps/api -- enrich`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - The prompt is the spec's "Score prompt" section, built from Appendix C of `docs/superpowers/specs/reference/codex-experience-scoring.md`.
  - Keep, in this order: the role and purpose, untrusted-input and no-tools, title-as-context, the recruiter comprehension test, the GRADING definitions (contribution, clarity, specificity copied, plus **impact**, worded from the spec's table), SUFFICIENCY TEST, the 7 CALIBRATION lines from the spec's table with all four grades, MEANINGFULNESS AND REPETITION, ACTIONABLE FEEDBACK (only `tip` and `question` fields, priority contribution → clarity → specificity → impact), and OUTPUT ("return grades, not numbers; every supplied id exactly once").
  - Drop Codex's EXPERIENCE-LEVEL REVIEW, coverage, scope and documentLocale text.
  - Prefix the Codex language instruction (Appendix B) with the CV locale.
  - `maxOutputTokens: Math.min(4000, 600 + 180 * bullets.length)`.
- [ ] **Step 4: Run** the full check. Expected: green.
- [ ] **Step 5: Commit** `feat(api): score one experience with cached grades`.

### Task 6: Rewrite routes (role and summary)

**Files:**
- Create: `apps/api/src/enrich/rewrite.ts`, `apps/api/src/enrich/rewrite.test.ts`
- Modify: `apps/api/src/enrich/prompts.ts`, `apps/api/src/enrich/routes.ts`

**Interfaces:**
- Consumes: Task 2 (`hasUnknownNumber`, `PROPOSAL_MAX`), Task 3 (notes), Task 4 (`CvRepo.snapshot`), and the Task 5 router.
- Produces:
  - `POST /v1/enrich/rewrite-role { roleId }` → `{ proposals: [{ replaces: string | null, text: string }] }`.
  - `POST /v1/enrich/rewrite-summary` → `{ proposal: string | null }`.
  - Model schemas: `ModelRoleRewriteSchema = { proposals: [{ replaces: string | null, text: string }] }` and `ModelSummarySchema = { proposal: string | null }`.

- [ ] **Step 1: Write failing tests**, with a fake model:
  - each route calls `snapshot("ai")` once, before the model call;
  - a proposal with an invented number is dropped;
  - a proposal of 221 characters or more is dropped;
  - a proposal whose `replaces` id isn't a bullet of the role is dropped;
  - `replaces: null` is kept only when the role has at least one note;
  - a proposal identical to its original (after trimming) is dropped;
  - the role's notes are in the user message as `Q:`/`A:` pairs;
  - bullets whose cached score is 100 are marked "keep as is" in the message;
  - the summary message includes every role's title, company, dates, bullets and notes;
  - an empty model list → `{ proposals: [] }` with 200.
- [ ] **Step 2: Run** `npm test -w apps/api -- rewrite`. Expected: FAIL.
- [ ] **Step 3: Implement.** The prompts state the spec's "Rewrite rules" list word for word, then tell the model to return only proposals that improve a bullet's grades without new facts. Task names: `enrich_rewrite_role` and `enrich_rewrite_summary`. `maxOutputTokens`: 2500 and 800.
- [ ] **Step 4: Run** the full check. Expected: green.
- [ ] **Step 5: Commit** `feat(api): rewrite a role's bullets or the summary without new facts`.

### Task 7: Skills route

**Files:**
- Create: `apps/api/src/enrich/skills.ts`, `apps/api/src/enrich/skills.test.ts`
- Modify: `apps/api/src/enrich/prompts.ts`, `apps/api/src/enrich/routes.ts`

**Interfaces:**
- Produces: `POST /v1/enrich/skills` → `{ suggestions: [{ name: string, group: "technicalSkills" | "professionalSkills", evidence: string }], sort: [{ skillId: string, group: "technicalSkills" | "professionalSkills" }] }`. There is no History copy.

- [ ] **Step 1: Write failing tests:**
  - a suggestion whose `name` doesn't appear in any role's title, description, bullets or notes (case-insensitive) is dropped;
  - a suggestion already present in any of the three skills groups (case-insensitive) is dropped;
  - `evidence` must be a substring of that role text, otherwise the suggestion is dropped;
  - a `sort` entry for an id not in `unclearSkills` is dropped;
  - at most 15 suggestions are kept;
  - the three skills groups are never merged.
- [ ] **Step 2: Run** `npm test -w apps/api -- skills`. Expected: FAIL.
- [ ] **Step 3: Implement.** Task `enrich_skills`, `maxOutputTokens` 1500. The prompt uses the group definitions from `packages/shared/src/cv.ts` (the comment above `technicalSkills` / `professionalSkills`).
- [ ] **Step 4: Run** the full check. Expected: green.
- [ ] **Step 5: Commit** `feat(api): suggest and sort skills from the experience`.

### Task 8: Web: score loading and the score pill

**Files:**
- Create: `apps/web/src/cv/enrich/enrich-api.ts`, `apps/web/src/cv/enrich/useRoleScores.ts`, `apps/web/src/cv/enrich/ScorePill.tsx`, `apps/web/src/cv/enrich/scores.test.tsx`
- Create: `apps/web/src/styles/enrich.css` (imported like `panel.css`)
- Modify: `apps/web/src/cv/Editor.tsx` (call `useRoleScores({ cv, status })` and pass `scores` down), the role component in `apps/web/src/cv/edit/sections/` (render `ScorePill` in the margin), `apps/web/src/i18n/en.ts`

**Interfaces:**
- Consumes: Task 1 (`fingerprint`, `band`, `clearCount`, `RoleResultSchema`) and Task 5 routes.
- Produces:
  - `useRoleScores({ cv: CvContent, status: SaveStatus }): { scores: Map<string, RoleScoreState>; retry(roleId): void }`.
  - `RoleScoreState = { state: "none" | "scoring" | "ready" | "previous" | "unavailable"; result?: RoleResult }`, where `previous` means there is a result for an older fingerprint.
  - `ScorePill { roleId, state, onOpen() }`.

- [ ] **Step 1: Write failing tests**, with mocked `enrich-api`:
  - on load, `GET /scores` is called once;
  - after status becomes `"saved"` and 2 s pass (fake timers), the first role with a stale or missing fingerprint is requested, then the next one, never two at once;
  - a result that arrives after the role's text changed shows as `previous` and is not treated as current (Review Focus 1);
  - a 409 → nothing is shown as an error, and the role is retried after the next `"saved"`;
  - a 503 → `unavailable`, the last result stays visible as `previous`, and `retry` requests it again;
  - a role with no bullets shows "Add bullets to get a score" with no request;
  - the pill is not rendered by the read-only `CvDocument`;
  - clicking the pill focuses the role's title field.
- [ ] **Step 2: Run** `npm test -w apps/web -- scores`. Expected: FAIL.
- [ ] **Step 3: Implement.** The pill sits in the role's left margin, next to the drag grip without overlapping it: use the right margin if the grip is on the left. It shows the band colour (`clear` pine, `goodStart` marigold, `needsWork` rose) and the number. While scoring it shows "…"; when previous, the number at 0.6 opacity. It has `aria-label` "Score {n} of 100, {band}. Open tips".
- [ ] **Step 4: Run** the full check. Expected: green, with the speed test still green (`scores` must not change identity for rows whose state didn't change).
- [ ] **Step 5: Commit** `feat(web): experience score pill that stays fresh after saves`.

### Task 9: Web: the score card in a role's tools

**Files:**
- Create: `apps/web/src/cv/enrich/ScoreCard.tsx`, `apps/web/src/cv/enrich/score-card.test.tsx`
- Modify: `apps/web/src/cv/panel/SectionTools.tsx` (render `ScoreCard` at the top of a role's tools), `apps/web/src/cv/panel/HelperPanel.tsx` (pass `scores`, `retry`), the role component (weak-bullet markers while the card is shown), `en.ts`

**Interfaces:**
- Consumes: Task 2 (`atsChecks`) and Task 8 (`RoleScoreState`).
- Produces: `ScoreCard { role: Experience; score: RoleScoreState; onAnswer(): void; onRewrite(): void; onRetry(): void }`. Weak-bullet markers are shown for bullets with a score below 75, with that bullet's `tip` (or the generic tip for its issue) as `title` and `aria-describedby` text.

- [ ] **Step 1: Write failing tests:**
  - the card shows the number, the band label and "3 of 5 bullets clear";
  - it shows at most 2 tips: `nextStep.tip` (or the generic tip for `nextStep.issue`) first, then the first ATS tip's text;
  - "Answer questions" is hidden when `questions` is empty;
  - "Rewrite bullets" is always shown when the role has bullets;
  - `unavailable` shows "Score unavailable" and "Try again" → `onRetry`;
  - markers appear only on bullets below 75, and only while the role's tools are open.
- [ ] **Step 2: Run** `npm test -w apps/web -- score-card`. Expected: FAIL.
- [ ] **Step 3: Implement.** Generic tips per issue, and the ATS tip texts, go in `en.ts` under `enrich.tips.*`. The "Improve with AI · Coming next" button for Experience is replaced by this card.
- [ ] **Step 4: Run** the full check. Expected: green.
- [ ] **Step 5: Commit** `feat(web): score card with tips in a role's tools`.

### Task 10: Web: questions and the rewrite review

**Files:**
- Create: `apps/web/src/cv/enrich/QuestionFlow.tsx`, `apps/web/src/cv/enrich/RewriteReview.tsx`, `apps/web/src/cv/enrich/rewrite.test.tsx`
- Modify: `apps/web/src/cv/edit/cvReducer.ts` and its test (`applyProposals`), `ScoreCard` / `SectionTools` (switch views), `en.ts`

**Interfaces:**
- Consumes: Task 3 (`setNote`), Task 6 routes, Task 9 (`onAnswer`, `onRewrite`).
- Produces:
  - Reducer action `{ type: "applyProposals"; roleId; accepted: [{ replaces: string | null; text: string }] }`. It replaces each bullet by id, skips any `replaces` id that no longer exists, and appends `replaces: null` items with new ids, up to `MAX_BULLETS`. It is one action, so one history (undo) step.
  - `QuestionFlow { role, questions: string[], dispatch, waitForSave(): Promise<void>, onDone(proposals) }`.
  - `RewriteReview { role, proposals, dispatch, onClose() }`.
  - `waitForSave` resolves when autosave status is next `"saved"`. Expose it from `Editor` via the existing `useAutosave` status.

- [ ] **Step 1: Write failing tests:**
  - **Question flow:**
    - questions are shown one at a time;
    - Next with text dispatches `setNote` with that question and answer;
    - Skip dispatches nothing;
    - after the last question, "Draft improved bullets" waits for save and then calls `rewrite-role`.
  - **Review:**
    - each proposal shows under its original bullet's text, or as "New bullet";
    - "Use this" on one, then "Done", dispatches one `applyProposals` with that one;
    - "Use all" applies all in one action, and a single undo restores every original bullet;
    - zero proposals shows "Couldn't improve this without adding facts. Try answering a question first.".
  - **Reducer:**
    - a proposal whose `replaces` bullet was deleted is skipped and the others apply (Review Focus 2);
    - appending stops at `MAX_BULLETS`.
- [ ] **Step 2: Run** `npm test -w apps/web -- rewrite cvReducer`. Expected: FAIL.
- [ ] **Step 3: Implement** the two views inside the role's tools, replacing the card while open. "← Back to score" returns. The Rewrite button goes straight to the review: it calls `rewrite-role` after `waitForSave`, and shows "Drafting…" while the call runs.
- [ ] **Step 4: Run** the full check. Expected: green.
- [ ] **Step 5: Commit** `feat(web): answer questions and review rewritten bullets one by one`.

### Task 11: Web: Summary and Skills tools

**Files:**
- Create: `apps/web/src/cv/enrich/SummaryTools.tsx`, `apps/web/src/cv/enrich/SkillsTools.tsx`, `apps/web/src/cv/enrich/summary-skills.test.tsx`
- Modify: `SectionTools.tsx` (render them for `summary` / `skills` in place of their "Coming next" AI buttons), `sectionTips.ts`, `en.ts`

**Interfaces:**
- Consumes: Task 2 (`summaryChecklist`, `skillsChecklist`), Task 6 (`rewrite-summary`), Task 7 (`skills`), and the existing reducer actions for summary text, `addSkill` and `moveSkill`.

- [ ] **Step 1: Write failing tests:**
  - **Summary:**
    - the checklist shows each item with ✓ or a short fix;
    - "Rewrite my summary" waits for save, then calls `rewrite-summary`;
    - the proposal shows with "Use this" / "Keep mine";
    - "Use this" dispatches one summary edit, undoable in one step;
    - a null proposal shows the "without adding facts" message.
  - **Skills:**
    - the checklist shows the missing tools by name;
    - "Suggest skills from my experience" shows each suggestion as a chip with its evidence line and "Add" (→ `addSkill` into its group);
    - "Sort for me" shows "→ Technical" / "→ Professional" per to-sort chip, with Apply dispatching `moveSkill` for each, as one undo step if the reducer allows; otherwise in order.
  - Key achievements still shows its "Coming next" button.
- [ ] **Step 2: Run** `npm test -w apps/web -- summary-skills`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the full check. Expected: green.
- [ ] **Step 5: Commit** `feat(web): summary and skills checklists with AI helpers`.

### Task 12: Evaluation set

**Files:**
- Create: `apps/api/eval/enrich/cases.ts`, `apps/api/eval/enrich/run.eval.ts`, `apps/api/eval/enrich/RESULTS.md`
- Modify: `apps/api/vitest.eval.config.ts` (include `eval/enrich/**`), `apps/api/package.json` and root `package.json` (`eval:enrich`)

**Interfaces:**
- Consumes: Task 5 (`scoreSystemPrompt`, `scoreUserMessage`, `buildRoleResult`), Task 6 rewrite prompts and checks, and the real `callModel` with `providersFromEnv` read from `.dev.vars`, like `eval/import/run.eval.ts`.

- [ ] **Step 1: Write the cases.**
  - **15 synthetic score roles**, fictional people only, 9 EN and 6 RO.
  - Together they include the 7 calibration lines from the spec, plus:
    - a placeholder ("TBD");
    - an exact duplicate;
    - a paraphrased duplicate;
    - a strong nontechnical role (a nurse, a warehouse lead);
    - a vague-results role;
    - a Romanian role with diacritics.
  - Each bullet has expected grades.
  - **5 rewrite cases** with traps:
    - a vague number;
    - an answer that adds a real number (it may be used);
    - no answers (no new numbers allowed);
    - a duplicate pair;
    - a Romanian role (the output must stay Romanian, checked by a diacritics or stop-word heuristic).
- [ ] **Step 2: Implement `run.eval.ts`.** It scores each case and prints per-case pass/fail, cost and duration. The pass bar:
  - each grade is within one step of expected on ≥ 90% of bullets;
  - placeholder and exact duplicate score 0;
  - 0 proposals with an unknown number (after the code check, and separately counting how many the model produced before the check);
  - rewrites stay in the case's locale.
- [ ] **Step 3: Run** `npm run eval:enrich` twice. Record both runs in `RESULTS.md`: the pass rate, slowest case, most expensive case, and total cost per run. If the bar fails, adjust only the prompt wording (not the weights or the checks), bump nothing else, and re-run. Note each prompt change in `RESULTS.md`.
- [ ] **Step 4: Commit** `test(api): live evaluation for experience scores and rewrites`. The eval is never run in CI.

### Task 13: Re-import keeps notes

**Files:**
- Create: `supabase/migrations/20261106010000_apply_import_content.sql` (re-create `apply_import` with an extra `p_content jsonb default null`; when given, it is saved instead of the stored import result, with the same version check and the same `import` History copy)
- Modify: `apps/api/src/imports/repo.ts`, `imports/memory-repo.ts`, `imports/supabase-repo.ts` (`apply(id, version, content?)`), `apps/api/src/imports/routes.ts` (apply: read the current CV and the import result, `content = carryNotes(current.content, imported)`, validate with `CvContentSchema`, pass it to `apply`), the import route tests, and the db steps file from Task 4

**Interfaces:**
- Consumes: Task 3 (`carryNotes`).

- [ ] **Step 1: Write failing tests:**
  - applying an import whose role matches an old role by company and title keeps that role's notes;
  - an import with no matching role saves the imported content unchanged;
  - the version conflict still returns 409.
- [ ] **Step 2: Run** `npm test -w apps/api -- imports`. Expected: FAIL.
- [ ] **Step 3: Implement.** Passing content is safe because the user can already save any valid content through `save_base_cv`, so it gives no new power.
- [ ] **Step 4: Run** the full check. Expected: green. Add the new migration to the db steps file.
- [ ] **Step 5: Commit** `feat(api): keep a role's notes when the CV is imported again`.

### Task 14: Decision record

- [ ] **Step 1: Write** `docs/decisions/NNNN-ai-enrichment-scores-and-notes.md`, with the next free number. Follow the front matter of `0010`:
  - `affects: [table:cv_insights, file:packages/shared/src/enrich.ts, file:apps/api/src/enrich/routes.ts, file:packages/shared/src/notes.ts]`.
  - What we decided:
    - answers are notes inside the CV (source data: History, restore, and job tailoring later);
    - scores live in `cv_insights` (a recomputable cache, with no autosave conflicts);
    - the model grades and the app computes the numbers;
    - the numbers check drops any proposal that contains a number not found in the person's own text or answers.
  - Options considered: everything inside the CV; everything in separate tables; nothing stored.
- [ ] **Step 2: Commit** only that file: `docs: decision record for AI enrichment scores and notes`.
