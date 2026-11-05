# Focus mode Implementation Plan

> **For agentic workers:** execute with the `codex-build` skill (resumora's replacement for subagent-driven-development). `## Task N` sections are Codex builds; `## Claude step X` sections are done by Claude (with the user where marked) and are skipped by codex-build.

**Goal:** Improve a role one bullet at a time in a full-screen focus mode, where every proposal is graded by the existing scorer before it is offered and every accepted change raises the stored score.

**Architecture:** Three new API routes (`improve-bullet`, `brain-dump`, `role-facts`) reuse the scorer to grade candidates. `improve-bullet` stores the predicted role result in `cv_insights.pending` under the future fingerprint, and `scoreRole` promotes it after autosave, so the celebrated number is the stored number. On the web, a `useFocusSession` hook drives the steps, and the FocusMode components render them to match the mockups. The whole-role streamed rewrite is removed; the summary keeps streaming.

**Tech Stack:** TypeScript, zod, Hono (API on Cloudflare Workers), React + Vite (web), Supabase Postgres + pgTAP, vitest.

**Spec:** `docs/superpowers/specs/2026-11-05-focus-mode-design.md`, which builds on `docs/superpowers/specs/2026-11-05-base-cv-enrichment-design.md`. Mockups: `docs/superpowers/specs/reference/focus-mode/`.

## Changes to the spec agreed in review (2026-11-05)

1. **Brain-dump note:** the API finds the ramble by a shared constant `BRAIN_DUMP_QUESTION` (in `packages/shared`), and the web stores notes with that same constant as the question. No string matching against i18n text.
2. **Brain-dump celebration:** after **Add selected**, focus mode waits for autosave and the normal background score of the role, shows "Scoring your new bullets…", and celebrates with the **real stored** score (old → new, or "first score"). `roleAfterAll` is only shown on the pick step as "up to N". If no fresh score arrives within 15 s, it skips the celebration and continues.
3. **`putPending` only updates an existing row.** If the role has no `cv_insights` row, nothing is cached (the proposal is still returned).
4. **Model answers for the new tasks are JSON via `callModel`**, not plain text: `{ text: string | null }` (improve), `{ bullets: string[] }` (brain dump), `{ facts: string[] }` (role facts). `null` plays the role of `NONE`. Same meaning as the spec, and it reuses `callModel`'s validation and retries.

## Global Constraints

- Every route needs sign-in, reads the **saved** CV, goes through the AI gateway (`callModel`), and logs one `ai_calls` row per model call.
- Error shape: `AiUnavailableError`/`AiInputRejectedError` → 503 `ai_unavailable`; an answer that fails the schema on every retry is reported by `callModel` as `AiUnavailableError` → 503 (as `scoreRole` does today); a schema-valid answer our code rejects (`EnrichParseError`, e.g. wrong bullet ids) or a length cut-off → 502 `ai_bad_answer`; role missing or fingerprint ≠ saved → 409 `not_saved`; unknown bullet → 404 `bullet_not_found`; no ramble → 400 `no_brain_dump`.
- Writing rules for every generated bullet: only facts from the role's text and notes; the CV's language; verb first; past tense for past roles, present for the current role; ≤ 220 characters; no first person; tool, product and domain names kept exactly; a picked range stays a range.
- Model task ids: `enrich_score`, `enrich_improve_bullet`, `enrich_brain_dump`, `enrich_role_facts`.
- Policy id `score/2`. `MAX_QUESTIONS` 20. `MAX_NOTES` 25. Facts: ≤ 8 items of ≤ 160 characters. Pending: ≤ 5 entries per role.
- Score bands and colours: green ≥ 75, marigold below. Celebration count-up about 1.4 s, ease-out. Voice limits: 60 s answers, 120 s brain dump.
- `facts` and notes are never rendered on the page, in `CvDocument`, the PDF or exports.
- All UI strings go in `apps/web/src/i18n/en.ts` (flat dotted keys, prefix `enrich.focus.`). Styles use only tokens from `styles/tokens.css`; the new file is `styles/focus.css`, imported in `main.tsx` after `enrich.css`.
- The API never writes CV content. The web applies every change through `cvReducer` (each change is one dispatch, which is one undo step).
- Codex must not open `.env*`, `.dev.vars` or other secret files.

## Review Focus

1. **The bullet changed after the call started** (another tab, or History restore while focus mode is open): **Use this** must not overwrite the newer text. `useFocusSession` compares the bullet's current text with the text it sent and, if they differ, discards the proposal and re-runs the improve call once. Test in Task 8.
2. **A long brain dump:** a ramble longer than `MAX_LONG_TEXT` (4000) would make the CV fail validation and break autosave. The brain-dump text box has `maxLength={MAX_LONG_TEXT}`, and the hook trims the answer to `MAX_LONG_TEXT` before `setNote`. Test in Task 8.
3. **Double submit:** a second click on **Improve this bullet →**, **Use this** or **Add selected** while a call or dispatch is running must do nothing. Test in Task 8.
4. **A role near the 20-bullet cap:** the brain dump offers at most `MAX_BULLETS − bullets.length` proposals, and `addBullets` never exceeds `MAX_BULLETS`. Tests in Task 4 (API cap) and Task 7 (reducer cap).
5. **The brain-dump note pushed out by the 25-note cap:** the API uses the newest note with `question === BRAIN_DUMP_QUESTION`, and `setNote` keeps the newest notes, so the note just written is always present. Test in Task 4 (25 older notes plus the ramble).

## Workspace

`resumora-enrichment` holds `.dev.vars` and `.env.local`, so `codex-ask -Build` refuses it. Builds run in a clean worktree:

```
git -C C:\Users\mcosm\claude\resumora\resumora worktree add ..\resumora-focus -b rebuild/focus-mode rebuild/enrichment
```

At the end (Claude step C), `rebuild/enrichment` is fast-forwarded to `rebuild/focus-mode` so the `enrichment-dev` app (http://localhost:5174) runs the result.

---

## Claude step A: setup, migration and RLS check (with the user)

Not a Codex task: the database stays with Claude and the user (CODEX-DELEGATION › Never delegate).

- [ ] Create the worktree above. Copy the spec, the mockups and this plan from `resumora-enrichment/docs/superpowers/` into the same paths in `resumora-focus`. They are listed in Task 1's `new_files`, so they go in with the first build commit.
- [ ] Write `supabase/migrations/20261107010000_insights_pending.sql`:
  ```sql
  alter table public.cv_insights add column pending jsonb not null default '[]'::jsonb;
  ```
  The table-level grants and the four owner-only policies (`20261106000000_enrichment.sql`) already cover the new column. No new policy.
- [ ] Extend `supabase/tests/database/enrichment.test.sql`: the column exists with default `[]`; as user B, an `update ... set pending` on user A's row changes 0 rows and a `select pending` returns nothing. **The user writes the cross-user assertion** (Learn by Doing).
- [ ] Write `docs/superpowers/plans/2026-11-05-focus-mode-db-steps.md` (same style as `2026-11-05-enrichment-db-steps.md`): `db push`, then read-only checks for the column, its default and the unchanged 4 policies.
- [ ] The user applies it. Claude confirms with read-only SQL (`list_tables` / `execute_sql` select only).

---

## Task 1: Shared: policy score/2, question kind, facts, mergeGrades, focus answer schemas

```
---
files: [packages/shared/src/enrich.ts, packages/shared/src/enrich.test.ts, packages/shared/src/cv.ts, packages/shared/src/cv.test.ts, packages/shared/src/notes.ts, packages/shared/src/notes.test.ts, packages/shared/src/index.ts, apps/api/src/enrich/repo.test.ts, apps/web/src/cv/edit/cvReducer.test.ts, apps/web/src/cv/enrich/question-flow.test.tsx, apps/web/src/cv/enrich/save-failed.test.tsx, apps/web/src/cv/enrich/score-card.test.tsx, apps/web/src/cv/enrich/scores.test.tsx, apps/web/src/cv/enrich/answer-box.test.tsx, apps/web/src/cv/enrich/answer-picks.test.tsx, supabase/tests/database/enrichment.test.sql]
new_files: [packages/shared/src/enrich-focus.ts, packages/shared/src/enrich-focus.test.ts, docs/superpowers/specs/2026-11-05-focus-mode-design.md, docs/superpowers/specs/reference/focus-mode/focus-layout.html, docs/superpowers/specs/reference/focus-mode/braindump-voice.html, docs/superpowers/specs/reference/focus-mode/celebration.html, docs/superpowers/plans/2026-11-05-focus-mode.md, supabase/migrations/20261107010000_insights_pending.sql, docs/superpowers/plans/2026-11-05-focus-mode-db-steps.md]
deps: false
size: 800        # ~1250 of the changed lines are the docs, migration and SQL test written before the build
---
```

The docs, migration and SQL test files in `new_files` were written by Claude before this build. **Do not modify them.**

**Goal:** the shared types and pure functions that every later task uses.

**Interfaces (produces):**
- `enrich.ts`: `SCORE_POLICY = "score/2"`; `MAX_QUESTIONS = 20`; `QuestionSchema` gains `kind: z.enum(["detail", "result"])`, type `QuestionKind`; `export function questionKind(b: { contribution: Grade; clarity: Grade; specificity: Grade; impact: Grade }): QuestionKind`, which returns `"result"` when contribution, clarity and specificity are `specific` and impact is not, else `"detail"`; `buildRoleResult` sets `kind` on every question; `repeatKey(text: string): string` becomes exported; new `export function hashText(text: string): string` (the existing cyrb53, as base-36).
- `cv.ts`: `MAX_NOTES = 25`; `RoleFactsSchema = z.object({ items: z.array(text(160)).max(8), fromNotes: z.string(), updatedAt: <the ISO datetime type askedAt uses> }).strict()`, type `RoleFacts`; `ExperienceSchema` gains `facts: RoleFactsSchema.nullable().optional()`. Missing and `null` both mean "no facts". It is optional, not `.default(null)`, so code that builds an `Experience` (fixtures, `imports.ts`, the eval) needs no change.
- `notes.ts`: `carryNotes` also carries `facts` from the matched old role, unless the incoming role already has non-null `facts`.
- `enrich-focus.ts` (re-exported from `index.ts`):
  - `BRAIN_DUMP_QUESTION = "What did a normal week here look like?"`
  - `MAX_PENDING = 5`
  - `mergeGrades(role: Experience, stored: RoleResult | null, graded: ModelBullet[], fingerprintValue: string): RoleResult`
  - `ImproveAnswerSchema = z.union([z.object({ needsDetail: z.literal(true) }).strict(), z.object({ proposal: z.object({ bulletId: z.string(), text: z.string() }), bulletBefore: z.number().int(), bulletAfter: z.number().int(), roleBefore: z.number().int().nullable(), roleAfter: z.number().int() }).strict()])`, type `ImproveAnswer`
  - `BrainDumpAnswerSchema = z.object({ proposals: z.array(z.object({ id: z.string(), text: z.string(), score: z.number().int() })).max(4), roleBefore: z.number().int().nullable(), roleAfterAll: z.number().int().nullable() }).strict()`, type `BrainDumpAnswer`
  - `RoleFactsAnswerSchema = z.object({ facts: z.array(z.string()).max(8), fromNotes: z.string() }).strict()`, type `RoleFactsAnswer`

**`mergeGrades` algorithm** (it reuses `buildRoleResult` so the zero rules, issue order, questions and `nextStep` stay in one place):
1. For each bullet of `role`, take the `graded` entry with its id. Otherwise rebuild a `ModelBullet` from `stored.bullets` with the same id: `meaningful: issue !== "example"`, the four grades, `issue`, `duplicateOf`: the id of the role's first bullet when the stored issue is `duplicate` (a flagged duplicate is never first, so this keeps its score at 0), else `null`; `tip`, `question`, and `options` from `stored.questions.find(q => q.bulletId === id)?.options ?? []`.
2. If a bullet has neither, throw `EnrichParseError`.
3. Return `buildRoleResult(role, { bullets, nextStepId: stored?.nextStep?.bulletId ?? null }, fingerprintValue)`.

**Acceptance tests:**
- `enrich.test.ts`: `questionKind` returns `"result"` for specific/specific/specific/missing and `"detail"` for partial/specific/specific/missing; a role of 5 bullets with questions keeps all 5 questions (old cap 3 gone), each with its `kind`; `SCORE_POLICY === "score/2"`.
- `cv.test.ts`: an experience without `facts` parses (with `facts` undefined), and one with `facts: null` parses; 9 facts or a 161-character fact fail; 25 notes pass and 26 fail.
- `notes.test.ts`: re-import with a matching company and title carries `facts`; incoming non-null `facts` win.
- `enrich-focus.test.ts`:
  - `mergeGrades` with one bullet re-graded from partial/specific/missing/missing (43) to specific/specific/specific/missing (80) gives that bullet a score of 80 and recomputes the role score as the rounded mean;
  - unchanged bullets keep their stored grades, tips and question options;
  - a bullet missing from both inputs throws `EnrichParseError`;
  - `stored = null` with every bullet graded works (the brain dump on an empty role);
  - a graded bullet whose text repeats another bullet (same `repeatKey`) scores 0.
- `npm run typecheck` and `npm test` pass in all workspaces. The policy bump changes expected values in existing API and web tests; update only the `score/1` literals, the 3-question and 10-note expectations, and add `kind` to question fixtures, in the six API/web test files listed in `files`.

**Out of scope:** API routes, prompts, web code.

---

## Task 2: API: pending cache, promotion in scoreRole, grade-only scoring

```
---
files: [apps/api/src/enrich/repo.ts, apps/api/src/enrich/memory-repo.ts, apps/api/src/enrich/supabase-repo.ts, apps/api/src/enrich/score.ts, apps/api/src/enrich/score.test.ts, apps/api/src/enrich/repo.test.ts, apps/api/src/enrich/prompts.ts, apps/api/src/enrich/fake-model.ts, docs/superpowers/plans/2026-11-05-focus-mode.md]
new_files: []
deps: false
size: 220
---
```

**Goal:** store predicted role results and serve them without a model call. Also add a scoring call that grades only some bullets.

**Interfaces:**
- Consumes (Task 1): `mergeGrades`, `MAX_PENDING`, `SCORE_POLICY`, `RoleResultSchema`, `ModelBullet`, `ModelScoreSchema`.
- Produces:
  - `repo.ts`: `type PendingEntry = { fingerprint: string; result: RoleResult; at: string }`; `InsightsRepo` gains `pending(roleId: string): Promise<PendingEntry[]>` and `putPending(roleId: string, result: RoleResult): Promise<void>`.
  - `score.ts`: `export type ScoreDeps = { cv: CvRepo; insights: InsightsRepo; model: ModelDeps; userId: string }`; `export function aiError(err: unknown): never`, which throws the 503/502 `ApiError` as `scoreRole` does today and rethrows anything else; `export async function gradeBullets(deps: ScoreDeps, role: Experience, locale: Locale, ids: readonly string[]): Promise<ModelBullet[]>`.
  - `prompts.ts`: `scoreUserMessage(role, gradeOnly?: readonly string[])`.

**Behaviour:**
- `putPending`: reads the row's `pending`, drops entries that fail `RoleResultSchema`, replaces any entry with the same fingerprint, appends `{ fingerprint: result.fingerprint, result, at: now ISO }`, keeps the newest `MAX_PENDING` by `at`, and writes **only** `pending` with `update(...).eq("role_id", roleId)`. **If no row exists it does nothing** (no insert: `fingerprint`/`policy`/`result` are NOT NULL). `put` keeps sending only the main columns, so it never touches `pending`. The memory repo follows the same rules.
- `scoreRole`: (1) a cached main row with matching fingerprint and policy wins, as today; (2) else a `pending` entry whose `fingerprint` matches and whose `result.policy === SCORE_POLICY` is written with `put` and returned, with no model call; (3) else score as today.
- `gradeBullets` calls `callModel` with task `enrich_score`, `scoreSystemPrompt(locale)`, `scoreUserMessage(role, ids)`, and the plain `ModelScoreSchema`. **After** the call, as `buildRoleResult` does for `scoreRole`, it throws `EnrichParseError` unless `bullets` holds exactly `ids` (so a wrong id set is a 502 with no retries, and no state is captured from inside the schema). It returns those bullets. `maxOutputTokens: 600 + 180 * ids.length`.
- `scoreUserMessage` with `gradeOnly` adds one final line: `Grade only these bullets: <ids joined by ", ">. Return entries for those ids only; the other bullets are context.`
- `scoreSystemPrompt` adds, in the feedback rules: when a bullet's only gap is impact, the question asks for a result (how many, how often, for whom, or what changed), and its options are ranges.

**Acceptance tests:**
- `repo.test.ts` (memory repo): `putPending` on a missing row stores nothing; a sixth entry drops the oldest `at`; the same fingerprint replaces its entry; `put` after `putPending` keeps `pending` intact.
- `score.test.ts`:
  - with a pending entry for the requested fingerprint, `scoreRole` returns it, makes **no** model call (`requests.length === 0`), and a later `get` returns it as the main row;
  - a pending entry with policy `score/1` is ignored and the role is scored;
  - `gradeBullets` sends the `Grade only these bullets: b2` line, logs task `enrich_score`, returns one bullet, and maps an answer with an extra id to 502 `ai_bad_answer`.
- All existing tests pass.

**Out of scope:** new routes, migrations (already written), web.

---

## Task 3: API: POST /v1/enrich/improve-bullet

```
---
files: [apps/api/src/enrich/routes.ts, apps/api/src/enrich/rewrite.ts]
new_files: [apps/api/src/enrich/improve.ts, apps/api/src/enrich/improve.test.ts, apps/api/src/enrich/focus-prompts.ts]
deps: false
size: 280
---
```

**Goal:** rewrite one bullet, grade it with the scorer, and offer it only if it scores higher, caching the predicted role result.

**Interfaces:**
- Consumes: `scoreRole`, `gradeBullets`, `aiError`, `ScoreDeps` (Task 2); `mergeGrades`, `repeatKey`, `fingerprint`, `ImproveAnswer` (Task 1); `checkProposal` (rewrite.ts).
- Produces:
  - `improve.ts`: `export async function improveBullet(deps: ScoreDeps, input: { roleId: string; bulletId: string; fingerprint: string }): Promise<ImproveAnswer>`.
  - `focus-prompts.ts`: `improveBulletSystemPrompt(locale: Locale): string` and `improveBulletUserMessage(role: Experience, bulletId: string): string`. Task 4 adds to this file.

**Steps of `improveBullet`** (spec › API › improve-bullet):
1. Load the saved CV. Role missing or fingerprint ≠ → 409 `not_saved`. Bullet missing → 404 `bullet_not_found`.
2. `before = await scoreRole(deps, { roleId, fingerprint })`.
3. `callModel` task `enrich_improve_bullet`, schema `{ text: string | null }`. The user message has the role title, description and other bullets (marked context only), the target bullet, and the role's notes (question + answer). The system prompt has the Global Constraints writing rules, the untrusted-source rule, and: "Return `null` if the bullet cannot be improved without facts that are not given."
4. `null` → `{ needsDetail: true }`. Otherwise trim it. `checkProposal(role, bulletId, text) !== "ok"`, or `repeatKey(text)` equal to another bullet's → `{ needsDetail: true }`.
5. `swapped` = the role with that bullet's text replaced. `graded = await gradeBullets(deps, swapped, locale, [bulletId])`. `predicted = mergeGrades(swapped, before, graded, fingerprint(swapped, locale))`.
6. `after` = the predicted score for that bullet. If `after <= ` the bullet's score in `before` → `{ needsDetail: true }`.
7. Unless another bullet in `before` has `issue === "duplicate"`, call `insights.putPending(roleId, predicted)`.
8. Return `{ proposal: { bulletId, text }, bulletBefore, bulletAfter: after, roleBefore: before.score, roleAfter: predicted.score }`.
- Model errors go through `aiError`. The route is `app.post("/improve-bullet", ...)`, with the body parsed by zod `{ roleId, bulletId, fingerprint }`, following the `/score` route's pattern.

**Acceptance tests (`improve.test.ts`, memory repos + `fakeModel`):**
- a better grade → a proposal with `bulletBefore` 43, `bulletAfter` 80 and the recomputed `roleAfter`; a then-`scoreRole` with `fingerprint(swapped)` returns `roleAfter` with no model call;
- an equal or lower grade → `{ needsDetail: true }`, and nothing is cached;
- the model returns `null` → `needsDetail`, and only one model call is made;
- a proposal with a number that is in neither the role nor its notes → `needsDetail`; a number given in a note is kept;
- a proposal equal to another bullet (case and spacing differ) → `needsDetail`;
- another bullet with issue `duplicate` → a proposal is returned and `pending` stays empty;
- a stale fingerprint → 409 `not_saved`; an unknown bullet → 404 `bullet_not_found`;
- user B's request for user A's `roleId` → 409 (only the caller's CV is read);
- the logged tasks are `enrich_improve_bullet` then `enrich_score`.

**Out of scope:** brain dump, role facts, removing the role rewrite.

---

## Task 4: API: POST /v1/enrich/brain-dump and POST /v1/enrich/role-facts

```
---
files: [apps/api/src/enrich/routes.ts, apps/api/src/enrich/focus-prompts.ts]
new_files: [apps/api/src/enrich/brain-dump.ts, apps/api/src/enrich/brain-dump.test.ts, apps/api/src/enrich/role-facts.ts, apps/api/src/enrich/role-facts.test.ts]
deps: false
size: 300
---
```

**Goal:** turn a ramble into graded new bullets, and condense a role's notes into facts.

**Interfaces:**
- Consumes: `scoreRole`, `gradeBullets`, `aiError`, `ScoreDeps` (Task 2); `mergeGrades`, `repeatKey`, `hashText`, `BRAIN_DUMP_QUESTION`, `BrainDumpAnswer`, `RoleFactsAnswer` (Task 1); `checkProposal`, `hasUnknownNumber`.
- Produces:
  - `brain-dump.ts`: `export async function brainDump(deps: ScoreDeps, input: { roleId: string; fingerprint: string }): Promise<BrainDumpAnswer>`
  - `role-facts.ts`: `export async function roleFacts(deps: ScoreDeps, input: { roleId: string }): Promise<RoleFactsAnswer>`
  - `focus-prompts.ts` gains `brainDumpSystemPrompt(locale)`, `brainDumpUserMessage(role, ramble)`, `roleFactsSystemPrompt(locale)`, `roleFactsUserMessage(role)`.

**`brainDump`:**
- 409 as in Task 3. The ramble is the answer of the newest note (by `askedAt`) with `question === BRAIN_DUMP_QUESTION`; none → 400 `no_brain_dump`.
- `slots = min(4, MAX_BULLETS − role.bullets.length)`. `slots === 0` → `{ proposals: [], roleBefore, roleAfterAll: roleBefore }` with no call.
- `before = role.bullets.length ? await scoreRole(...) : null`.
- `callModel` task `enrich_brain_dump`, schema `{ bullets: string[] }` with at most 4. Prompt: up to `slots` new bullets using only what the ramble says, not repeating existing bullets, plus the writing rules.
- Normalise each text with `squash` (exported from `rewrite.ts` in Task 3) before any check, and return the squashed text, so the 220-character check measures what is returned.
- Keep the first `slots` texts that pass `checkProposal(role, "new", text)` (the saved role already holds the ramble as a note, so its numbers count as sources), and the repeat check against existing bullets and earlier kept ones. Temporary ids are `new1`…`new4`.
- No survivors → `{ proposals: [], roleBefore: before?.score ?? null, roleAfterAll: before?.score ?? null }` with no grading call.
- One `gradeBullets` call on the role with all survivors appended, ids = the temporary ids. `merged = mergeGrades(...)`. Keep proposals with a score ≥ 40.
- `roleAfterAll` = the score of `mergeGrades` on the role with only the kept proposals appended, using the same graded bullets (no second call). `null` when none are kept and the role has no bullets.
- No pending cache.

**`roleFacts`:**
- Reads the saved role (404 `role_not_found` if missing; no fingerprint needed). No notes → `{ facts: [], fromNotes: hashText("") }` with no call.
- `callModel` task `enrich_role_facts`, schema `{ facts: string[] }` with at most 8. Prompt: short facts, each ≤ 160 characters, in the CV's language, only what the person said.
- Drop facts longer than 160 characters or with a number not found in the notes' answers (`hasUnknownNumber`). `fromNotes = hashText(notes.map(n => n.id + "\u0000" + n.answer).join("\u0001"))`.
- Never writes the CV.

**Routes:** `app.post("/brain-dump")` with `{ roleId, fingerprint }`, `app.post("/role-facts")` with `{ roleId }`.

**Acceptance tests:**
- `brain-dump.test.ts`:
  - at most 4 proposals, each with its score; a proposal graded below 40 is dropped;
  - an invented number is dropped; a number from the ramble is kept;
  - a repeat of an existing bullet is dropped;
  - no ramble → 400 `no_brain_dump`; the newest of two rambles is used;
  - 25 older notes plus the ramble still find the ramble;
  - a role with 18 bullets gets at most 2 proposals; a role with 20 gets none and no model call;
  - an empty role gives `roleBefore: null` and a numeric `roleAfterAll`;
  - the logged tasks are `enrich_brain_dump` then `enrich_score`.
- `role-facts.test.ts`: at most 8; a fact with a number not in the notes is dropped; no notes → no model call; the saved CV is unchanged after the call; `fromNotes` changes when an answer changes; logs `enrich_role_facts`.

**Out of scope:** web, eval.

---

## Task 5: API: remove the whole-role rewrite

```
---
files: [apps/api/src/enrich/routes.ts, apps/api/src/enrich/rewrite.ts, apps/api/src/enrich/rewrite-prompts.ts, apps/api/src/enrich/rewrite.test.ts, apps/api/src/enrich/routes.test.ts, apps/api/eval/enrich/cases.ts, apps/api/eval/enrich/run.eval.ts]
new_files: []
deps: false
size: 350
---
```

Some test files in `files` may not exist under these exact names. Codex edits the tests that exercise `rewrite-role` wherever they live, and reports their paths.

**Goal:** delete the `rewrite-role` route and the code only it uses. The summary rewrite keeps streaming.

**Remove:** the `/rewrite-role` route; `keepAsIsIds`; the `keepAsIs` parameter of `checkProposal` (new signature `checkProposal(role: Experience, key: string, text: string): "ok" | DropReason`); `rewriteRoleSystemPrompt` and `rewriteRoleUserMessage`; tests for those; the eval's `REWRITE_CASES` and the runner code that runs them.

**Keep, unchanged:** `rewriteEvents`, `sendEvents`, `BlockParser`, `checkSummary`, `roleSources`, `summarySources`, the summary route and prompts, `streamModel`.

**Acceptance tests:**
- `POST /v1/enrich/rewrite-role` → 404.
- Every existing summary-rewrite test passes unchanged.
- `npm run typecheck` passes, including `apps/api/eval`.

**Out of scope:** web files (`RewriteReview`, `QuestionFlow` and the web client are removed in Claude step B).

---

## Task 6: Eval: single-bullet and brain-dump cases

```
---
files: [apps/api/eval/enrich/cases.ts, apps/api/eval/enrich/run.eval.ts, apps/api/eval/enrich/RESULTS.md]
new_files: []
deps: false
size: 220
---
```

**Goal:** a live check that improvements beat the old grade without inventing numbers.

**Interfaces:** consumes `improveBullet` (Task 3) and `brainDump` (Task 4), run with memory repos and the real model deps the runner already builds.

- `cases.ts` adds `IMPROVE_CASES: ImproveCase[]` with `{ id, locale, role: Experience, bulletId, notes: Note[], expectNumber?: string, forbidNumber?: string }`. Six cases:
  1. a vague bullet plus an answer;
  2. an answer with a picked range (`rangeOnly`);
  3. an 80 bullet plus a result answer;
  4. a Romanian role;
  5. a duplicate trap (the obvious rewrite equals another bullet);
  6. an answer that suggests a number not given (`forbidNumber`).
- `cases.ts` adds `DUMP_CASES` with `{ id, locale, role, ramble }`, one EN and one RO.
- The runner records per case: the before and after grades, needsDetail, any invented number (via `hasUnknownNumber` against the role and notes), the language (RO cases must contain no English sentence: reuse the existing language check if there is one, otherwise flag for manual review), tokens and seconds. It writes them to `enrich-last.json`.
- **Pass:** 0 invented numbers; after > before in at least 5 of 6 improve cases; each brain dump returns ≥ 1 proposal in the CV's language.
- `RESULTS.md` gets a "Focus mode" section with the pass rules and an empty results table. Claude fills it after the live run (Claude step C), because the worktree has no API keys.

**Acceptance tests:** `npm run typecheck` passes, and `npm test` doesn't run the eval (as today).

**Out of scope:** running it live.

---

## Task 7: Web data layer: stream-events, enrich-api, reducer actions

```
---
files: [apps/web/src/cv/enrich/enrich-api.ts, apps/web/src/cv/enrich/RewriteReview.tsx, apps/web/src/cv/enrich/SummaryTools.tsx, apps/web/src/cv/edit/cvReducer.ts, apps/web/src/cv/edit/cvReducer.test.ts]
new_files: [apps/web/src/cv/enrich/stream-events.ts, apps/web/src/cv/enrich/enrich-api.test.ts]
deps: false
size: 200
---
```

**Goal:** the client calls and reducer actions focus mode needs. The old components keep working.

**Interfaces (produces):**
- `stream-events.ts`: `Proposal` and `onEvent(list, run, e)` moved verbatim from `RewriteReview.tsx`. `RewriteReview.tsx` and `SummaryTools.tsx` import them from here.
- `enrich-api.ts`:
  - `improveBullet(input: { roleId: string; bulletId: string; fingerprint: string }): Promise<ImproveAnswer>`
  - `brainDump(input: { roleId: string; fingerprint: string }): Promise<BrainDumpAnswer>`
  - `roleFacts(roleId: string): Promise<RoleFactsAnswer>`

  All three use `apiFetch` and parse with the Task 1 schemas, as `scoreRole` does.
- `cvReducer.ts`, new `CvAction` variants:
  - `{ type: "replaceBullet"; roleId: string; bulletId: string; text: string }`: unchanged CV if the role or bullet is missing.
  - `{ type: "addBullets"; roleId: string; texts: string[] }`: appends with `newId()`, stops at `MAX_BULLETS`, unchanged CV for an empty list.
  - `{ type: "setFacts"; roleId: string; facts: RoleFacts | null }`.

**Acceptance tests:**
- `cvReducer.test.ts`: `replaceBullet` changes only that bullet's text and keeps its id; `addBullets` with 3 texts on an 18-bullet role adds 2; `setFacts` sets and clears; each returns the same object when nothing changes.
- `enrich-api.test.ts`: each function posts to `/v1/enrich/improve-bullet`, `/brain-dump` or `/role-facts` with the right body, and rejects an answer that fails its schema.
- The existing `summary-skills.test.tsx` and `rewrite-review.test.tsx` pass with the moved imports.

**Out of scope:** components, `useFocusSession`.

---

## Task 8: Web: useFocusSession

```
---
files: []
new_files: [apps/web/src/cv/enrich/useFocusSession.ts, apps/web/src/cv/enrich/focus-session.test.tsx]
deps: false
size: 420
---
```

**Goal:** all of focus mode's queue and step logic, with no visual markup, so the components only render `step` and call actions.

**Interfaces:**
- Consumes: `improveBullet`, `brainDump`, `roleFacts` (Task 7); `CvAction` variants `setNote`, `replaceBullet`, `addBullets`, `setFacts`; `RoleScoreState` and `scores` from `useRoleScores`; `BRAIN_DUMP_QUESTION`, `MAX_LONG_TEXT`, `fingerprint`, `hashText`.
- `waitForSave` is the function `useWaitForSave(status)` already returns in `Editor.tsx`. The hook takes it as a parameter (tests pass a fake), and Claude step B wires it through `SectionTools`.
- Produces `useFocusSession.ts`:
  ```ts
  export type FocusMode = "improve" | "standOut";
  export type FocusStep =
    | { kind: "brainDump" }
    | { kind: "dumpWorking" }
    | { kind: "dumpPick"; proposals: { id: string; text: string; score: number }[]; roleAfterAll: number | null }
    | { kind: "dumpEmpty" }
    | { kind: "dumpScoring" }
    | { kind: "question"; bulletId: string; question: Question | null }
    | { kind: "working"; bulletId: string }
    | { kind: "proposal"; bulletId: string; text: string; bulletBefore: number; bulletAfter: number; roleBefore: number | null; roleAfter: number }
    | { kind: "needsDetail"; bulletId: string; question: Question | null }
    | { kind: "failed"; bulletId: string | null; reason: "unavailable" | "saving" }
    | { kind: "celebrate"; from: number | null; to: number; next: "queue" | "done" }
    | { kind: "roleDone"; score: number | null };
  export function useFocusSession(opts: {
    cv: CvContent; roleId: string; bulletId?: string; mode: FocusMode;
    scores: Map<string, RoleScoreState>; dispatch: (a: CvAction) => void;
    waitForSave: () => Promise<void>; onClose: () => void;
  }): {
    step: FocusStep; queue: string[]; position: number; busy: boolean;
    submitAnswer(text: string, via: Via[]): void;   // question, needsDetail (free text) and brainDump
    skip(): void; useProposal(): void; keepMine(): void;
    addSelected(ids: string[]): void; next(): void; retry(): void; close(): void;
  };
  ```
  `useProposal` and `keepMine` are actions, not React hooks; the names come from the spec's buttons.

**Rules:**
- **Start:** `role.bullets.length <= 2` → `brainDump`. Else the first queue item.
- **Queue:** for `improve`, the bullet ids by stored score ascending (ties in CV order), excluding score 100, with `bulletId` moved first when given. For `standOut`, the bullets whose stored `impact !== "specific"`, in CV order. The question for a bullet is `result.questions.find(q => q.bulletId === id) ?? null`. With no question, go straight to `working`.
- **submitAnswer:** trim to `MAX_LONG_TEXT`. Ignore it if empty. `dispatch setNote` with a new id, the shown question's text (`BRAIN_DUMP_QUESTION` on the brain dump; the i18n follow-up text on a free-text `needsDetail`), `via` and `askedAt`. Mark `notesChanged`. `await waitForSave()`, then call the API.
- **409 `not_saved`:** `await waitForSave()` and retry once. A second 409 → `failed` with `"saving"`. A 503/502 → `failed` with `"unavailable"`. `retry()` repeats the last call.
- **Attempts:** at most 2 improve calls per bullet per session. A third `needsDetail` moves to the next bullet.
- **needsDetail:** shows the bullet's stored question if it hasn't been answered in this session, otherwise `question: null` (the free text box).
- **useProposal:** if the bullet's current text ≠ the text at call time → discard and re-run the improve call once (it counts as an attempt). Else `dispatch replaceBullet`, then `celebrate` from `roleBefore` to `roleAfter`.
- **keepMine** and **skip:** next bullet, no celebration.
- **addSelected:** `dispatch addBullets` with the picked texts → `dumpScoring`. Wait until `scores.get(roleId)` is `ready` with a result whose fingerprint equals `fingerprint(currentRole, locale)`. Then, if its score > the score before (or the role had none) → `celebrate`, else go straight on. 15 s without a fresh score → go straight on. Then the queue is built from that result.
- **Brain dump with 0 proposals** → `dumpEmpty`, keeping the text (the component keeps its own text state).
- **After the last item** → `roleDone` with the current score.
- **close():** if `notesChanged`, call `roleFacts(roleId)` without awaiting the UI. On success, `dispatch setFacts({ items: facts, fromNotes, updatedAt: now })`. Ignore failures. Then call `onClose`.
- **Role removed from `cv`** while open → `onClose()` (no role-facts).
- **busy:** true while an API call, `waitForSave` or `dumpScoring` is running. Every action is a no-op while busy.

**Acceptance tests (`focus-session.test.tsx`, `renderHook` + a mocked `enrich-api` + fake timers):**
- the improve queue order with a chosen bullet first, and a 100 bullet excluded; the standOut queue holds only impact < specific;
- a role with 2 bullets starts on `brainDump`; with 3, on the first question;
- submitAnswer dispatches `setNote` before calling `improveBullet`, and the call waits for `waitForSave`;
- the proposal → `useProposal` dispatches one `replaceBullet` and moves to `celebrate` with `from`/`to` from the answer;
- `keepMine` moves on without `celebrate`;
- a third needsDetail on the same bullet moves to the next bullet;
- 409 twice → `failed`/`saving`; 503 → `failed`/`unavailable`, and `retry` repeats the call;
- the bullet text changed between the call and `useProposal` → no dispatch, and a second `improveBullet` call;
- a double `submitAnswer` makes one API call;
- a 5000-character answer is saved as 4000;
- `addSelected` → `dumpScoring` → `celebrate` once a matching ready score arrives; after 15 s with none, it goes on without `celebrate`;
- `close` with changed notes calls `roleFacts` and dispatches `setFacts`; without changes it makes no call; a failure dispatches nothing;
- a role removed from `cv` calls `onClose`.

**Out of scope:** any rendering.

---

## Task 9: Web: voice countdown and maxSeconds

```
---
files: [apps/web/src/cv/enrich/useVoice.ts, apps/web/src/cv/enrich/AnswerBox.tsx, apps/web/src/cv/enrich/answer-box.test.tsx]
new_files: []
deps: false
size: 150
---
```

**Goal:** the state logic for cue A (3-2-1 while connecting) and per-use limits. Claude styles it in step B.

**Interfaces (produces):**
- `VoiceState` gains `"countdown"`.
- `useVoice(opts: { locale: Locale; maxSeconds?: number })` (default 60) returns, in addition, `count: 3 | 2 | 1 | null` and `connecting: boolean`.
- `AnswerBox` gains the prop `maxSeconds?: number` (passed to `useVoice`). While `state === "countdown"` it renders `<div data-testid="voice-countdown" aria-live="polite">{count}</div>`, plus the `enrich.focus.voice.gettingReady` text when `count === 1 && connecting`.

**Rules:**
- `start()` sets `countdown` with `count` 3 and starts the session request immediately. `count` goes 3 → 2 → 1 a second apart.
- `recording` begins only when the countdown has reached its end (1 s after showing 1) **and** the audio stream is open. If the stream opens late, the state stays `countdown` with `count === 1` and `connecting === true`.
- The recording stops itself at `maxSeconds`.
- 429 `voice_limit` happens before any countdown: the state becomes `limit` directly.
- `stop()` during the countdown cancels it and closes the session.

**Acceptance tests (`answer-box.test.tsx`, fake transport + fake timers):**
- 3, 2, 1 are shown a second apart, then recording starts;
- a stream opening after 5 s keeps showing 1 with "Getting the mic ready…" until it opens;
- a stream open after 0.5 s still waits for the countdown;
- `maxSeconds={120}` stops at 120 s and the default stops at 60 s;
- `voice_limit` never shows the countdown.

**Out of scope:** styling, the waveform.

---

## Claude step B: the focus-mode front end

Owner: **Claude**, matched to the three mockups. The guard blocks Claude under `apps/**`, so before starting, Claude asks the user to lift it (CODEX-DELEGATION › Guardrails). If the user declines, Claude splits this step into Codex Tasks 10–12 (shell + question/proposal/done; brain dump + voice styling; celebration + ✨ + ScoreCard), with exact markup and CSS from the mockups in each brief, and they run through codex-build like the others.

Files:
- **New:** `apps/web/src/cv/enrich/FocusMode.tsx`, `QuestionStep.tsx`, `ProposalStep.tsx`, `BrainDumpStep.tsx`, `CelebrateMoment.tsx`, `RoleDoneStep.tsx`, `ImproveButton.tsx`, `apps/web/src/styles/focus.css`, `apps/web/src/cv/enrich/focus-mode.test.tsx`.
- **Changed:** `ScoreCard.tsx` (one button: **Improve this role**, or **Make it stand out** with "Clear! Add results to stand out." when score ≥ 80 and some bullet's impact isn't specific); `cv/panel/SectionTools.tsx` (opens `FocusMode`, no longer renders `QuestionFlow`/`RewriteReview`); `cv/edit/BulletList.tsx` (the ✨ button on hover or focus, editor only); `AnswerBox.tsx` (countdown, "● Start talking" pill, recording bar styles); `i18n/en.ts`; `main.tsx` (import `focus.css`).
- **Removed:** `QuestionFlow.tsx`, `RewriteReview.tsx`, `question-flow.test.tsx`, `rewrite-review.test.tsx`, and the role-rewrite call in the web client.

Done when:
- [ ] the layout, colours, radii, type and motion match `focus-layout.html` B, `braindump-voice.html` (cue A) and `celebration.html` B, compared side by side in the browser at desktop and 375 px widths;
- [ ] `FocusMode` is a portal with scroll lock and a focus trap; Esc and ✕ call `close()`; focus returns to the opener;
- [ ] `CelebrateMoment` counts up with `requestAnimationFrame` over about 1.4 s (ease-out), shows CSS confetti in brand colours, and with `prefers-reduced-motion` has no confetti and shows the final number;
- [ ] tests (run through `codex-ask -Test`): the ✨ button appears on hover/focus in the editor and never in `CvDocument`; **Use this** dispatches once and shows the celebration with the returned numbers; reduced motion renders no confetti; `needsDetail` shows the follow-up; Esc keeps accepted bullets; `SummaryTools` still works;
- [ ] committed through the same gate: `-Review` with this section as the brief, then the commit.

---

## Claude step C: final review, merge and verification

- [ ] codex-build end of run: one whole-branch `-Review` against `rebuild/enrichment`, plus the cost line in `2026-11-05-focus-mode.progress.md`.
- [ ] Decision record `docs/decisions/0013-focus-mode-graded-single-bullet-rewrites.md`, with the five points from the spec's "Decision record".
- [ ] With the user's OK: remove the untracked copies of the spec, mockups and plan in `resumora-enrichment` (identical to the committed ones), then `git -C resumora-enrichment merge --ff-only rebuild/focus-mode`.
- [ ] The user applies the migration (Claude step A doc), if not done yet.
- [ ] Run `npm run eval:enrich` in `resumora-enrichment` with `EVAL_CASE` set to the focus cases. Fill in `RESULTS.md`. Pass rules as in Task 6.
- [ ] Verify in the running app (launch config `enrichment-dev`, http://localhost:5174):
  - a weak role: ✨ → answer → proposal "43 → 80" → Use this → celebration → the stored score after autosave equals the celebrated number, with no new `enrich_score` call in `ai_calls`;
  - a one-line role: brain dump → pick 2 of 4 → the celebration shows the real stored score;
  - an 80+ role: Make it stand out;
  - the voice countdown;
  - Esc → facts written (check the saved content in History);
  - the summary rewrite still streams;
  - screenshots to the user.
- [ ] Push or PR only after the user says yes.

---

## Task 10: Whole-branch review fixes: History copy, honest celebration, reducer cleanup

Added after the whole-branch review (2026-11-05). The user chose: the History copy goes back, and an uncached prediction is never celebrated.

```
---
files: [packages/shared/src/enrich-focus.ts, packages/shared/src/enrich-focus.test.ts, apps/api/src/enrich/improve.ts, apps/api/src/enrich/improve.test.ts, apps/api/src/enrich/brain-dump.ts, apps/api/src/enrich/brain-dump.test.ts, apps/web/src/cv/enrich/useFocusSession.ts, apps/web/src/cv/enrich/focus-session.test.tsx, apps/web/src/cv/enrich/FocusMode.tsx, apps/web/src/cv/enrich/focus-mode.test.tsx, apps/web/src/cv/enrich/enrich-api.test.ts, apps/web/src/cv/edit/cvReducer.ts, apps/web/src/cv/edit/cvReducer.test.ts, apps/web/src/i18n/en.ts, docs/superpowers/plans/2026-11-05-focus-mode.md]
new_files: [docs/decisions/0013-focus-mode-graded-single-bullet-rewrites.md]
deps: false
size: 320
---
```

The decision record in `new_files` and this plan were written by Claude. **Do not modify them.**

**Goal:** four fixes from the whole-branch review.

1. **History copy before AI changes.** `improveBullet` and `brainDump` call `deps.cv.snapshot("ai")` once per call, after the 409/404/400 checks and before the first model call, as the summary route does (`routes.ts`, `cv.snapshot("ai")`). The snapshot function already skips a copy when History's newest copy holds the same CV.
2. **Never celebrate a number that is not stored.** `ImproveAnswerSchema`'s proposal variant gains `cached: z.boolean()`: true when `putPending` was called, false when caching was skipped (another bullet is a duplicate). In `useFocusSession`:
   - the step `{ kind: "dumpScoring" }` becomes `{ kind: "scoring"; source: "dump" | "bullet" }`; the existing wait (a `ready` score whose fingerprint equals the current role's, or 15 s) is shared by both sources;
   - `useProposal` with `cached: false` dispatches `replaceBullet`, then goes to `{ kind: "scoring", source: "bullet" }`, and when the fresh score arrives celebrates from `roleBefore` to the fresh score if it is higher, else moves to the next bullet; on the 15 s timeout it moves to the next bullet;
   - `FocusMode` shows "Scoring your new bullets…" for `source: "dump"` (existing key) and "Checking your new score…" for `source: "bullet"` (new key `enrich.focus.scoring` in `en.ts`).
3. **No celebration without a change.** `useProposal` with `cached: true` and `roleAfter <= roleBefore` (and `roleBefore !== null`) dispatches `replaceBullet` and moves to the next bullet with no `celebrate` step. The same rule holds for a fresh score in point 2.
4. **Reducer cleanup.** Remove the `applyProposals` variant from `CvAction` and its case. `addBullets` appends its texts directly (new ids with `newId()`, stops at `MAX_BULLETS`, unchanged CV for an empty list). Remove or adapt the `applyProposals` tests so `addBullets` keeps its coverage.

**Acceptance tests:**
- `improve.test.ts`: one `ai` snapshot per call, taken before the model call (also when the answer is `needsDetail`); `cached: true` with a stored prediction; `cached: false` and nothing in `pending` when another bullet is a duplicate.
- `brain-dump.test.ts`: one `ai` snapshot per call; none when the request fails the 409 or 400 checks.
- `focus-session.test.tsx`: `cached: true` with `roleAfter === roleBefore` → one `replaceBullet`, no `celebrate`, next bullet; `cached: false` → `scoring`/`bullet`, then `celebrate` with the fresh score when a matching higher score arrives; a matching score that is not higher → next bullet, no `celebrate`; 15 s without a score → next bullet; the brain-dump flow still passes through `scoring`/`dump`.
- `focus-mode.test.tsx` and `enrich-api.test.ts`: fixtures gain `cached`; "Checking your new score…" shows for an uncached proposal.
- `cvReducer.test.ts`: `addBullets` still appends with new ids and caps at 20; no `applyProposals`.
- Typecheck, lint and the full test suite pass.

**Out of scope:** the score route, prompts, the migration, styles.

---

## Task 11: Second whole-branch review fixes: paraphrase duplicates, summary drop reasons, stale facts

Added after the second whole-branch review (2026-11-05).

```
---
files: [packages/shared/src/enrich-focus.ts, packages/shared/src/enrich-focus.test.ts, apps/api/src/enrich/improve.ts, apps/api/src/enrich/improve.test.ts, apps/api/src/enrich/role-facts.ts, apps/web/src/cv/enrich/useFocusSession.ts, apps/web/src/cv/enrich/focus-session.test.tsx, apps/web/src/i18n/en.ts, apps/web/src/cv/enrich/summary-skills.test.tsx, apps/web/src/cv/edit/cvReducer.ts, apps/web/src/cv/edit/cvReducer.test.ts, docs/superpowers/plans/2026-11-05-focus-mode.md]
new_files: []
deps: false
size: 200
---
```

This plan was edited by Claude. **Do not modify it.**

**Goal:** three fixes.

1. **A proposal that paraphrases a later bullet.** In `improveBullet`, grade the swapped role with the target bullet moved to the **end** of the bullet list (a grading-only copy; the real order is unchanged everywhere else). The scorer then sees every other bullet before the proposal, so a near-duplicate comes back with `duplicateOf` set. If the graded bullet has `duplicateOf !== null` or `meaningful === false`, return `{ needsDetail: true }`. `mergeGrades` and the cached prediction keep using the real order.
2. **Summary drop reasons.** Restore these five strings in `apps/web/src/i18n/en.ts` exactly as they were (they were removed by mistake; `SummaryTools.tsx` builds the key as `` `enrich.drop.${reason}` ``):
   - `"enrich.drop.number": "Left out: it added a number you didn't give us"`
   - `"enrich.drop.length": "Left out: it was too long for one bullet"`
   - `"enrich.drop.unknownBullet": "Left out: it was for a bullet that isn't in this role"`
   - `"enrich.drop.unchanged": "Left out: it said the same as your bullet"`
   - `"enrich.drop.newWithoutNote": "Left out: a new bullet needs an answer from you first"`
3. **Stale facts after a History restore.** Add to `enrich-focus.ts`: `export function notesHash(notes: readonly Note[]): string`, which returns `hashText(notes.map((n) => n.id + "\u0000" + n.answer).join("\u0001"))` (the formula `role-facts.ts` uses today; make `role-facts.ts` call it). In `useFocusSession`'s `close()`, dispatch `setFacts` only if the role still exists **and** `notesHash(role.notes)` of the current role equals the returned `fromNotes`.

**Acceptance tests:**
- `improve.test.ts`: the grading request lists the target bullet last; a graded answer with `duplicateOf` set gives `needsDetail` and caches nothing.
- `enrich-focus.test.ts`: `notesHash` changes when an answer or an id changes, and is stable otherwise.
- `focus-session.test.tsx`: a role-facts answer whose `fromNotes` no longer matches the role's notes (the notes changed after close) dispatches nothing; a matching one dispatches `setFacts` as before.
- `summary-skills.test.tsx`: a dropped summary proposal with reason `number` shows "Left out: it added a number you didn't give us".
- Typecheck, lint and the full test suite pass.

**Out of scope:** everything else.

---

## Task 12: Third whole-branch review fixes: AI call logging, leftover styles

Added after the third whole-branch review (2026-11-05). The logging fix is a database change, written by Claude (`log_ai_call`'s allowlist did not include the three new tasks, so their `ai_calls` rows were rejected); Codex removes the dead styles.

```
---
files: [apps/web/src/styles/enrich.css, supabase/tests/database/enrichment.test.sql, docs/superpowers/plans/2026-11-05-focus-mode-db-steps.md, docs/superpowers/plans/2026-11-05-focus-mode.md]
new_files: [supabase/migrations/20261107020000_focus_ai_tasks.sql]
deps: false
size: 120
---
```

The migration, the SQL test, the db-steps doc and this plan were written by Claude. **Do not modify them.**

**Goal:** remove the styles only the deleted `QuestionFlow` / `RewriteReview` used from `apps/web/src/styles/enrich.css`: at least `.qbox`, `.qcount`, `.qtext`, `.qfor`, plus any other selector in that file whose class no longer appears in any `.tsx` file under `apps/web/src` (search before removing each one; keep anything still referenced, including by `SummaryTools`, `SkillsTools`, `ScoreCard`, `AnswerBox` and the page).

**Acceptance tests:** each removed class has no remaining reference in `apps/web/src`; typecheck, lint and the full test suite pass.

**Out of scope:** everything else.

---

## Task 13: Fourth whole-branch review fixes: stale queue grades, temporary id collisions

Added after the fourth whole-branch review (2026-11-05).

```
---
files: [apps/web/src/cv/enrich/useFocusSession.ts, apps/web/src/cv/enrich/focus-session.test.tsx, apps/api/src/enrich/brain-dump.ts, apps/api/src/enrich/brain-dump.test.ts, docs/superpowers/plans/2026-11-05-focus-mode.md]
new_files: []
deps: false
size: 100
---
```

This plan was edited by Claude. **Do not modify it.**

**Goal:** two fixes.

1. **Stale grades when building the queue.** In `useFocusSession`'s `buildQueue`, use the stored result's per-bullet grades (score and impact) only when `result.fingerprint === fingerprint(role, cv.locale)`. Otherwise treat every bullet as having no grade: it is kept in the queue in both modes, and in `improve` mode sorts as score 0 (CV order among ties), with the ✨-chosen bullet still first. The same rule applies wherever the queue is rebuilt (after the brain dump).
2. **Temporary ids in the brain dump.** In `brainDump`, generate the proposals' temporary ids so they never equal an id already in the role: start from `new1`, and skip any candidate that is already a bullet id (or already used by an earlier proposal). Returned proposal ids stay unique.

**Acceptance tests:**
- `focus-session.test.tsx`: with a stored result whose fingerprint does not match the role (the role was edited after scoring) and that has a bullet at 100, opening in `improve` mode keeps that bullet in the queue; with a matching fingerprint the 100 bullet is still excluded (unless chosen with ✨).
- `brain-dump.test.ts`: a role whose saved bullet has id `new1` gets proposals with ids that differ from every saved id, and the grading call succeeds.
- Typecheck, lint and the full test suite pass.

**Out of scope:** everything else.

---

## Task 14: Hands-on fixes: wide-screen layout, plain follow-up box

Found in the hands-on check in the running app (2026-11-05, a ~1570 px wide window). The user chose layout B.

```
---
files: [apps/web/src/styles/focus.css, apps/web/src/cv/enrich/QuestionStep.tsx, apps/web/src/cv/enrich/focus-mode.test.tsx, docs/superpowers/plans/2026-11-05-focus-mode.md]
new_files: []
deps: false
size: 40
---
```

This plan was edited by Claude. **Do not modify it.**

**Goal:** two fixes.

1. **Layout B: a fixed role column, both columns centred.** On wide screens the left column stretched to half the window and the right column stopped at 680 px, leaving a large empty area on the right. In `apps/web/src/styles/focus.css`:
   - `.focus-mode` gets `grid-template-columns: minmax(300px, 380px) minmax(0, 720px); justify-content: center;` (the background stays full-screen, because it is on `.focus-mode` itself);
   - `.fm-right` drops its `max-width: 680px`, because the grid column now caps it;
   - the phone rule (`@media (max-width: 760px)`) is unchanged: one column, the role on top.
2. **The "anything else?" box is plain.** When `QuestionStep` has no stored question (the follow-up after "We need a bit more detail"), it renders `AnswerBox` with `plain`, so the lone "Something else" chip is not shown. A step with a stored question keeps its chips.

**Acceptance tests:**
- `focus-mode.test.tsx`: in the needs-detail follow-up (free text), there is no "Something else" button; on a question step with options, the options and "Something else" are shown as before.
- Typecheck, lint and the full test suite pass.

**Out of scope:** everything else.
