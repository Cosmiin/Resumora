# Enrichment: Shape first, one fair score — Implementation Plan

> **For agentic workers:** build with the `claude-build` skill (owner's rule): test-first per task, a fresh review
> agent per task, commit per task. Steps use checkbox (`- [ ]`) syntax for tracking. Copy this file to
> `docs/plans/2026-11-19-enrich-shape.md` in the worktree before Task 1.

**Goal:** One score that answers can't lower (lines + six core items), a Shape step that merges overlapping lines
before the questions, writers that see the grades, every answer used, and an end of the path with no changes sheet,
all roles prepared at once.

**Architecture:** The score change is pure shared code (`buildCoverage`, `SCORE_POLICY`). Three new API calls:
`/shape` proposes merges, `/use-answers` places answer facts still missing, `/check-changes` grades only the changed
lines of a proposed role, holds changes that would lower the score, and stores the predicted result under the new
fingerprint (as `improveBullet` already does with `putPending`) so the score after saving costs no AI call. One shared
`applyChanges(role, changes)` builds the proposed role identically in the browser (a reducer action) and on the
server, so both reach the same fingerprint.

**Tech Stack:** React + Vitest + Testing Library (apps/web), Hono on Workers (apps/api), zod (packages/shared).

**Spec:** `C:\Users\mcosm\claude\resumora\enrichment-score-shape-design-2026-11-19.md` (approved 19 Nov 2026).
Walkthrough: https://claude.ai/artifact/7c9zr1VoemwsUDh333LbuL.

**Branch:** `feat/enrich-shape`, worktree `resumora-shape`, base `main` (`15ed0f7`).

## Global Constraints

- Role score = `round(0.6 × lines + 0.4 × core)`; `core = round(100 × shown / 6)` over company, purpose, actions,
  tools, results, scale. Leadership, seniority, people, domain and the shape checks never change the number.
  `SCORE_POLICY = "score/9"`. 80 still means enriched; CV strength weights unchanged.
- "On the page" = title, description and lines together (today's coverage rule).
- Any line a writer produces (merge, rewrite, answer fact, new line): at most 220 characters (`CONCISE_CHARS.partial`),
  and every number in it appears in the role's text or notes. Shape merges keep every number of the lines they replace.
- Nothing invented. Answers "no" / "I don't know" add nothing.
- Shape merges and reorders need the person's confirmation; path changes after the questions go on the CV directly.
- A bullet change that doesn't raise its line's grade, or a new line graded below the role's line average, is held
  (shown on the end screen with "Add anyway"), never applied silently and never dropped silently.
- Lines whose text didn't change keep their stored grades.
- No automatic retry of failed AI calls beyond today's OpenRouter pause and OpenAI fallback (owner's rule).
- New AI tasks: `enrich_shape`, `enrich_use_answers`. Grading reuses `enrich_score`.
- Unchanged: companies and tools screens, upload, tailoring, projects, the per-role run's own steps (it shows the new
  score), the 8-question budget size. No database migration. Existing stored scores are not converted.
- Every new string in `en-basecv.ts` and `ro-basecv.ts` (same keys), under `enrich.path.*` or `enrich.explain.*`.

## Review Focus

1. A merge whose text turns "5-10 client accounts" into "several clients": the group is dropped server-side (Task 3).
2. "10–20%" in one line and "10-20%" in the merged text (en dash vs hyphen) count as the same number (Task 3).
3. The CV is edited between a proposal and `/check-changes`: 409; the path applies the changes without a prediction
   and the normal score runs (Task 4, Task 7).
4. One role's AI call fails while preparing: the other roles' changes are applied, the end screen says some changes
   could not be made, answers stay saved (Task 7).
5. A role with 6 or fewer lines and no repeats: no `/shape` model call; with no such role anywhere, Shape is skipped
   (Task 3, Task 6).

---

## Task 1: The new score and the two-tier question budget
scope:
  files: [packages/shared/src/enrich.ts, packages/shared/src/enrich.test.ts, packages/shared/src/enrich-path.ts, packages/shared/src/enrich-path.test.ts, packages/shared/src/index.ts]
  new_files: []
  deps: []
  size: 160

**Interfaces — Produces:**
- `buildCoverage(...)` keeps its signature and returns `{ score, marks, shape }`; `score` = `round(100 × core shown / 6)`.
  `COVERAGE_POINTS` is removed (fix every use the typecheck finds).
- `SCORE_POLICY = "score/9"`.
- `worthAdding(coverage: Coverage): { param: ConditionalParameter; shown: boolean }[]` — the four conditional items
  whose mark is not `na`, `shown` true when the mark is `shown`. Export `ConditionalParameter` type.
- `pickBudget` keeps its signature. Tier 1: line questions and role questions whose topic is not in
  `CONDITIONAL_TOPICS`; tier 2: role questions with a conditional topic. Fill `size` from tier 1 by value first, then
  from tier 2 by value; final order unchanged (CV order, role questions before line questions within a role).

- [ ] **Step 1: Write the failing tests**
  - `enrich.test.ts`: a role with lines 80 and all six core shown → score 88; same role with leadership `applies` and
    people `applies` → still 88; with tools not shown → `round(0.6×80 + 0.4×83)` = 81; shape all false → unchanged score.
  - `worthAdding`: marks leadership `na`, seniority `applies`, people `shown`, domain `unknown` → seniority false,
    people true, domain false, no leadership.
  - `enrich-path.test.ts`: 10 tier-1 candidates and 3 tier-2 with higher values → 8 tier-1 returned; 2 tier-1 and 3
    tier-2 → all 5 returned, tier-1 first by value; output still CV-ordered.
- [ ] **Step 2: Run** `npx vitest run src/enrich.test.ts src/enrich-path.test.ts` in `packages/shared` → FAIL.
- [ ] **Step 3: Implement** the formula, `worthAdding`, the two tiers; bump `SCORE_POLICY`.
- [ ] **Step 4: Run** `npm test` and `npm run typecheck` from the repo root → PASS (update existing score
  expectations that asserted the old formula, nothing else).
- [ ] **Step 5: Commit** "Score: lines and six core items only; worth-adding questions last".

## Task 2: Writers see the grades
scope:
  files: [apps/api/src/enrich/prompts.ts, apps/api/src/enrich/focus-prompts.ts, apps/api/src/enrich/improve.ts, apps/api/src/enrich/brain-dump.ts, apps/api/src/enrich/improve.test.ts, apps/api/src/enrich/brain-dump.test.ts]
  new_files: [apps/api/src/enrich/grade-context.ts, apps/api/src/enrich/grade-context.test.ts]
  deps: [1]
  size: 200

**Interfaces — Produces:**
- `GRADING_RULES: string` — the GRADING section of today's score prompt, moved out of `SCORE_BODY` and inserted back
  in the same place, so the score prompt's text is byte-identical.
- `gradeContext(role: Experience, result: RoleResult | undefined, ids?: readonly string[]): string` — for each bullet
  (or only `ids`): `id`, grade, its parts (`contribution`, `clarity`, `specificity`, `impact`, `concise`), length as
  `"<n> of 220 characters"`; then the role score and line average; then `GRADING_RULES`; then the task lines:
  "Use the answers. Keep every part at least as good as now. Improve the parts marked partial or missing. Stay
  within 220 characters." Empty string when `result` is undefined.
- `improveBullet` passes `gradeContext(role, before, [bulletId])` in its user message; `brainDump` with
  `source: "answers"` passes `gradeContext(role, stored)` plus "Each new line must reach at least the role's line
  average."

- [ ] **Step 1: Write the failing tests**: `grade-context.test.ts` — includes "impact: missing" for a bullet graded so,
  "178 of 220 characters" for a 178-char bullet, the role score and line average, `GRADING_RULES`; only listed ids
  when `ids` given; `""` without a result. `improve.test.ts` / `brain-dump.test.ts` — the fake model's received user
  message contains the bullet's grade parts. `scoreSystemPrompt` output equals a snapshot taken before the move.
- [ ] **Step 2: Run** `npx vitest run src/enrich/grade-context.test.ts src/enrich/improve.test.ts src/enrich/brain-dump.test.ts` in `apps/api` → FAIL.
- [ ] **Step 3: Implement** `grade-context.ts`, the move of `GRADING_RULES`, and the two call sites.
- [ ] **Step 4: Run** `npm test` and `npm run typecheck` → PASS.
- [ ] **Step 5: Commit** "Writers get each line's grades and the grading rules".

## Task 3: Shared change model and the Shape API
scope:
  files: [packages/shared/src/index.ts, apps/api/src/enrich/routes.ts, apps/api/src/enrich/routes.test.ts, apps/web/src/cv/enrich/enrich-api.ts]
  new_files: [packages/shared/src/enrich-shape.ts, packages/shared/src/enrich-shape.test.ts, apps/api/src/enrich/shape.ts, apps/api/src/enrich/shape.test.ts]
  deps: [2]
  size: 320

**Interfaces — Produces (shared, `enrich-shape.ts`):**
- `Change` = `{ id: string; kind: "bullet"; bulletId: string; text: string }` | `{ id: string; kind: "new"; text: string }`
  | `{ id: string; kind: "description"; text: string }` | `{ id: string; kind: "remove"; bulletId: string }`
  | `{ id: string; kind: "order"; ids: string[] }`; `ChangeSchema` (texts max `MAX_TEXT`, description max `MAX_LONG_TEXT`).
- `applyChanges(role: Experience, changes: readonly Change[]): Experience` — pure; a `new` change becomes a bullet with
  `id = change.id` appended at the end; `order` reorders existing ids (unknown ids ignored, missing ids kept after);
  changes to unknown bullets are ignored. Same input → same output, in browser and Worker.
- `numbersIn(text: string): string[]` — number tokens incl. ranges and percents, with `–`/`—` normalized to `-`.
- `keepsNumbers(originals: readonly string[], text: string): boolean`.
- `strongestFirst(role: Experience, result: RoleResult): string | null` — the id of the real line (not `example` or
  `duplicate`) with `impact === "specific"` and the highest score, or `null` when the first real line already has
  `impact === "specific"` or none qualifies.
- `needsShape(role: Experience, result: RoleResult | undefined): boolean` — more than 6 non-empty lines, or a line
  with issue `duplicate`.
- `ShapeBodySchema` = `{ roleId, fingerprint }`; `ShapeAnswerSchema` = `{ merges: { ids: string[] (2–6); text: string (≤ 220) }[] (≤ 4) }`.

**API:** `proposeShape(deps: ScoreDeps, body: ShapeBody): Promise<ShapeAnswer>` in `shape.ts`, route
`POST /v1/enrich/shape` (pattern of `/improve-bullet`), task `enrich_shape`. 409 on a stale fingerprint. No model
call when `!needsShape`. Prompt: merge only lines describing the same work (same task, people or tools, little or
nothing new); never lines about different work; keep every number, tool, name and client; ≤ 220 characters; aim at 6
lines, merging only while above 6 or for true repeats; plus `gradeContext` with "a merged line must not be weaker
than the lines it replaces". Server drops a group whose ids are unknown, repeated across groups, fewer than 2, whose
text fails `keepsNumbers`, exceeds 220 characters, or equals one original; with 6 or fewer lines it keeps only groups
containing a `duplicate` line. **Web:** `proposeShape(input: ShapeBody): Promise<ShapeAnswer>` in `enrich-api.ts`.

- [ ] **Step 1: Write the failing tests**: `enrich-shape.test.ts` — `applyChanges` (bullet, new with given id, remove,
  order, unknown ids ignored, fingerprint of the result is stable across two calls); `numbersIn("10–20%")` equals
  `numbersIn("10-20%")`; `keepsNumbers(["for 5-10 client accounts"], "for several clients") === false`;
  `strongestFirst` returns the revenue line for the Vevol fixture (first line no specific impact) and `null` when the
  first line already has it; `needsShape` true for 8 lines, true for 5 lines with a duplicate, false for 5 clean lines.
  `shape.test.ts` — 409 on a stale fingerprint; no model call for a clean 5-line role; a merge dropping "5-10" is
  removed; a group repeating an id used by another group is removed; a 221-char text is removed. `routes.test.ts` —
  `POST /v1/enrich/shape` validates the body.
- [ ] **Step 2: Run** the new tests → FAIL.
- [ ] **Step 3: Implement** the shared module, `shape.ts`, the route, the web helper.
- [ ] **Step 4: Run** `npm test` and `npm run typecheck` → PASS.
- [ ] **Step 5: Commit** "Shape: propose merges of overlapping lines".

## Task 4: Check changes: grade only what changed, hold what would lower, predict the score
scope:
  files: [packages/shared/src/enrich-shape.ts, packages/shared/src/enrich-focus.ts, packages/shared/src/enrich-focus.test.ts, apps/api/src/enrich/score.ts, apps/api/src/enrich/routes.ts, apps/api/src/enrich/routes.test.ts, apps/web/src/cv/enrich/enrich-api.ts]
  new_files: [apps/api/src/enrich/check-changes.ts, apps/api/src/enrich/check-changes.test.ts]
  deps: [3]
  size: 300

**Interfaces — Produces:**
- `mergeGrades(role, stored, graded, fingerprint, coverage?: ModelCoverage)` — when `coverage` is given it replaces the
  stored marks.
- `gradeWithCoverage(deps: ScoreDeps, role: Experience, locale: Locale, ids: readonly string[]): Promise<{ bullets: ModelBullet[]; coverage: ModelCoverage }>`
  in `score.ts` — the score prompt with "grade only these" plus "Also return coverage for the whole role"; task `enrich_score`.
- `CheckChangesBodySchema` = `{ roleId, fingerprint, changes: Change[] (≤ 30), hold: boolean }`;
  `CheckChangesAnswer` = `{ result: RoleResult; kept: string[]; held: Change[] }` (shared).
- `checkChanges(deps: ScoreDeps, body: CheckChangesBody): Promise<CheckChangesAnswer>` in `check-changes.ts`, route
  `POST /v1/enrich/check-changes`; web helper `checkChanges(body): Promise<CheckChangesAnswer>`.

Behaviour: 409 on a stale fingerprint. `stored` = the role's current result (`scoreRole`, cached). `proposed =
applyChanges(saved role, changes)`. Grade ids = proposed bullets whose text differs from the saved bullet with that id,
new bullets, and stored lines with issue `duplicate`. One `gradeWithCoverage` call (none when nothing to grade and no
description change: then `mergeGrades` with stored marks). With `hold`: a `bullet` change whose new score ≤ its stored
score is held; a `new` change whose score < `stored.lines` is held. If any is held: a second `gradeWithCoverage` on
`applyChanges(saved, kept)` with the kept graded ids, for the final marks; the kept lines' grades come from the first
call. `result = mergeGrades(final role, stored, grades, fingerprint(final role), coverage)`, saved with
`insights.putPending`. `remove`, `order` and `description` changes are never held.

- [ ] **Step 1: Write the failing tests** (`check-changes.test.ts`, fake model): unchanged lines keep their stored
  grades; a merged line is graded and the two removed lines vanish; with `hold` a rewrite graded lower than before is
  in `held` and absent from the predicted role; a new line below the line average is held; with `hold: false` nothing
  is held; exactly one model call when nothing is held, two when something is; the result's `fingerprint` equals
  `fingerprint(applyChanges(role, kept))` and is stored with `putPending`; 409 on a stale fingerprint.
  `enrich-focus.test.ts`: `mergeGrades` with `coverage` uses it.
- [ ] **Step 2: Run** the new tests → FAIL.
- [ ] **Step 3: Implement** as above.
- [ ] **Step 4: Run** `npm test` and `npm run typecheck` → PASS.
- [ ] **Step 5: Commit** "Check changes: grade what changed, hold what would lower, predict the score".

## Task 5: Use every answer
scope:
  files: [packages/shared/src/enrich-shape.ts, apps/api/src/enrich/routes.ts, apps/api/src/enrich/routes.test.ts, apps/web/src/cv/enrich/enrich-api.ts]
  new_files: [apps/api/src/enrich/use-answers.ts, apps/api/src/enrich/use-answers.test.ts]
  deps: [4]
  size: 220

**Interfaces — Produces:**
- `UseAnswersBodySchema` = `{ roleId, fingerprint, changes: Change[] (≤ 30), questions: string[] (≤ 20) }` —
  `questions` are this round's note questions; `UseAnswersAnswer` = `{ changes: Change[] }` (`bullet`, `new` or
  `description` only).
- `useAnswers(deps: ScoreDeps, body: UseAnswersBody): Promise<UseAnswersAnswer>` in `use-answers.ts`, task
  `enrich_use_answers`, route `POST /v1/enrich/use-answers`; web helper `useAnswersOnCv(body)` (not `use…`, which
  React reads as a hook).

Behaviour: 409 on a stale fingerprint. `proposed = applyChanges(saved, changes)`. No model call when no note matches
`questions` (compare with `questionKey`). The prompt gets the proposed role, those notes and `gradeContext(proposed,
stored)`, and returns, for each fact still missing from the page: company, purpose, seniority and people go into the
description; size, tools and results into the line they belong to, or a new line when none fits. Skip answers that say
no or don't know. Server drops an output line over 220 characters or with a number not found in the role's text or
notes (`numbersIn`), and a description over `MAX_LONG_TEXT`. Returned `bullet` changes target the proposed text (the
client replaces its own change for that bullet).

- [ ] **Step 1: Write the failing tests**: no model call with no matching notes; a returned line with "50 stores" when
  no note or text says 50 is dropped; a 221-char line is dropped; a description change is returned as `description`;
  the model receives the proposed (not the saved) text of a rewritten line; 409 on a stale fingerprint.
- [ ] **Step 2: Run** → FAIL. - [ ] **Step 3: Implement.** - [ ] **Step 4: Run** `npm test` and `npm run typecheck` → PASS.
- [ ] **Step 5: Commit** "Use every answer: place missing facts on the page".

## Task 6: The Shape screen
scope:
  files: [apps/web/src/cv/edit/cvReducer.ts, apps/web/src/cv/edit/cvReducer.test.ts, apps/web/src/cv/enrich/EnrichPath.tsx, apps/web/src/cv/enrich/enrich-path.test.tsx, apps/web/src/i18n/en-basecv.ts, apps/web/src/i18n/ro-basecv.ts, apps/web/src/styles/focus.css]
  new_files: [apps/web/src/cv/enrich/ShapeStep.tsx, apps/web/src/cv/enrich/shape-step.test.tsx]
  deps: [3, 4]
  size: 340

**Interfaces — Produces:**
- Reducer action `{ type: "applyRoleChanges"; roleId: string; changes: Change[] }` — the role (experience or
  volunteering) becomes `applyChanges(role, changes)`.
- `ShapeStep` props: `{ cv: CvContent; scores: Map<string, RoleScoreState>; onDone(changes: { roleId: string; changes: Change[] }[]): void }`.
- `EnrichPath` stage `{ kind: "shape" }` between start and companies.
- The predicted score is shown at once through `EnrichPath`'s existing `onScore` prop (the editor already passes
  `roleScores.put`); `put(result)` below means `onScore(result)`.

Behaviour: on entering, call `proposeShape` for every graded item with `needsShape` (at most 4 at once) and compute
`strongestFirst` for every item. No merges and no reorders anywhere → go straight to companies. One card per role with
something to change: per merge the original lines, the merged text, **Merge / Edit / Keep separate** (Edit opens a
textarea; its text must still pass 220 characters); "Moved to the top: ‹line›" with **Keep order**. **Merge all and
continue** applies every merge not kept separate. On continue, per role: changes = for each accepted merge a `bullet`
change on its first id with the merged text plus `remove` for the others, then an `order` change with the strongest line
first (unless Keep order); `checkChanges({ hold: false })`; dispatch `applyRoleChanges` with all changes; `put(result)`.
On a 409 or failure, dispatch the changes anyway and let the normal score run. Copy (EN): eyebrow "Step 1 of 4 ·
Shape", title "Tidy your lines first", lead "Recruiters read 3 to 6 lines per role. Lines that describe the same work
are merged, keeping every number, tool and client.", "These {n} lines describe the same work", "Merged into one line",
"Moved to the top:", buttons as named. The other step eyebrows become "Step 2 of 4" (companies), "Step 3 of 4"
(tools), "Step 4 of 4" (questions).

- [ ] **Step 1: Write the failing tests**: reducer — `applyRoleChanges` on a volunteering item; `shape-step.test.tsx` —
  renders the merge card with the three original lines; Keep separate excludes that merge from `onDone`; Edit changes
  the text sent; Keep order omits the `order` change; `enrich-path.test.tsx` — with no role needing Shape, Start goes
  straight to companies; after Merge all the CV has the merged line in place of the first and the others removed.
- [ ] **Step 2: Run** `npx vitest run src/cv/enrich/shape-step.test.tsx src/cv/enrich/enrich-path.test.tsx src/cv/edit/cvReducer.test.ts` in `apps/web` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` and `npm run typecheck` → PASS.
- [ ] **Step 5: Commit** "Shape step: merge overlapping lines before the questions".

## Task 7: Prepare all roles at once, apply directly, the new end screen
scope:
  files: [apps/web/src/cv/enrich/EnrichPath.tsx, apps/web/src/cv/enrich/prepare.ts, apps/web/src/cv/enrich/prepare.test.ts, apps/web/src/cv/enrich/enrich-path.test.tsx, apps/web/src/i18n/en-basecv.ts, apps/web/src/i18n/ro-basecv.ts, apps/web/src/styles/focus.css]
  new_files: [apps/web/src/cv/enrich/EndStep.tsx, apps/web/src/cv/enrich/end-step.test.tsx]
  deps: [5, 6]
  size: 340

**Interfaces — Produces:**
- `createLimiter(max: number): <T>(task: () => Promise<T>) => Promise<T>` in `prepare.ts`; `prepareRoleChanges` takes
  an optional `limit` (default: its own limiter of `PARALLEL = 3`, so the per-role run is unchanged).
- `PATH_PARALLEL = 6` — requests at once for the whole CV while preparing (*Claude's call; tune after the real run*).
- `toChanges(changes: PrepChange[]): Change[]` (today's `Change` type in `prepare.ts` is renamed `PrepChange`; ids
  kept so `RoleRun` and `ReviewPieces` compile unchanged).
- `EndStep` props: `{ cv; scores; before: number | null; held: { roleId: string; change: Change }[]; failed: boolean; onAdd(roleId: string, change: Change): void; onDone(): void; onMore?(): void }`.

Behaviour of `prepare()`: all roles at the same time through one `createLimiter(PATH_PARALLEL)`; per role,
`prepareRoleChanges` → `toChanges` → `useAnswersOnCv` (replace a returned `bullet` change for the same bullet, add the
rest) → `checkChanges({ hold: true })` → dispatch `applyRoleChanges(kept)` → `put(result)`; collect `held`. A failed
call marks `failed` and keeps what that role already has; a 409 dispatches the role's changes without a prediction.
No review sheet: the path goes from preparing to the end. Preparing copy: "Putting your answers on your CV…", "All
roles at once." with one row per role (done / working). End: "Your CV: {from} → {to}", per role score before → after
and the checklist ticks (`worthAdding`, `coverage.shape`); per held change "Not added: it would lower {role}'s score a
little", the line, **Add anyway** (dispatch that change; the normal score then runs) and **Edit it first** (textarea,
then add); `failed` shows today's `enrich.path.v2.someFailed`; **Done** and the existing more-questions button
("8 more questions" runs questions → preparing → end, no Shape). `ReviewSheet.tsx` is deleted if nothing imports it.

- [ ] **Step 1: Write the failing tests**: `prepare.test.ts` — `createLimiter(2)` never runs more than 2 at once; with
  a shared limiter two roles' requests interleave. `end-step.test.tsx` — a held change shows its text; Add anyway calls
  `onAdd`; `failed` shows the notice. `enrich-path.test.tsx` — after the last question no review sheet appears; the
  CV contains the kept changes; a held new line is absent from the CV and shown on the end screen; with one role's
  `checkChanges` rejecting, the other role's changes are on the CV and the notice shows; with `checkChanges`
  answering 409, that role's changes are on the CV anyway and no prediction is put.
- [ ] **Step 2: Run** the tests → FAIL. - [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` and `npm run typecheck` → PASS.
- [ ] **Step 5: Commit** "Path: prepare all roles at once, apply directly, new end screen".

## Task 8: Start screen and score explanation show the checklist
scope:
  files: [apps/web/src/cv/enrich/EnrichPath.tsx, apps/web/src/cv/enrich/ScoreExplain.tsx, apps/web/src/cv/enrich/RoleScoreList.tsx, apps/web/src/cv/enrich/enrich-path.test.tsx, apps/web/src/i18n/en-basecv.ts, apps/web/src/i18n/ro-basecv.ts, apps/web/src/styles/focus.css]
  new_files: [apps/web/src/cv/enrich/Checklist.tsx, apps/web/src/cv/enrich/score-checklist.test.tsx]
  deps: [1, 7]
  size: 220

**Interfaces — Produces:** `RoleChecklist` component in `Checklist.tsx` (the existing `Checklist.tsx` keeps its export)
with props `{ result: RoleResult }`: "Shape" ticks (3–6 lines, no repeats, strongest line first, from
`coverage.shape`) and "Worth adding" ticks (`worthAdding`), ✓ when met, ○ when not.

Behaviour: Start lists each graded item with title · company · years, its score and `RoleChecklist`, then "Shape and
Worth adding don't change your score. They show what a recruiter notices." Lead: "About 5 minutes: tidy your lines,
then your companies, your tools, and the 8 questions that will help most." `ScoreExplain`: "What makes the number" —
Your lines · 60% (the line average) and What every role needs · 40% (n of 6 with the six ticks); then "Doesn't change
the number" with `RoleChecklist` and "These help a recruiter read the role. They can't lower your score, so answering
a question about them is never wasted." `RoleScoreList`'s "missing" tip names only a core item, never a conditional one.

- [ ] **Step 1: Write the failing tests**: `score-checklist.test.tsx` — ticks for a result with shape
  `{ amount: false, repeats: true, order: true }` and seniority `applies`; no leadership row when `na`; ScoreExplain
  shows "6 of 6" for all core shown; RoleScoreList never shows a leadership tip.
- [ ] **Step 2: Run** → FAIL. - [ ] **Step 3: Implement.** - [ ] **Step 4: Run** `npm test` and `npm run typecheck` → PASS.
- [ ] **Step 5: Commit** "Start and score explanation show the checklist".

## Task 9: Real AI check on the Vevol role (not committed)
scope:
  files: []
  new_files: [apps/api/eval/enrich-shape/run.eval.ts]
  deps: [3, 4, 5]
  size: 120

A temporary eval in the worktree, run with
`EVAL_DEV_VARS="C:/Users/mcosm/claude/resumora/resumora/apps/api/.dev.vars" npx vitest run --config vitest.eval.config.ts eval/enrich-shape`
(keys read in-process, never printed). Fixture: the Vevol Media role's 8 lines as on the owner's screenshot.

- [ ] **Step 1:** `proposeShape` merges lines 2, 3 and 5 into one or two lines, keeps "5-10", names Asana and Shopify
  Plus, stays ≤ 220 characters; the merged role scores at least the original's score.
- [ ] **Step 2:** `useAnswers` with a note "I reported to the Head of Ecommerce" puts it in the description, not a line.
- [ ] **Step 3:** `checkChanges` on a weak rewrite holds it; the predicted score equals the score of a full rescore of
  the kept role within ±3.
- [ ] **Step 4:** Report the numbers in the progress file, then delete `apps/api/eval/enrich-shape/`. Never commit it.
