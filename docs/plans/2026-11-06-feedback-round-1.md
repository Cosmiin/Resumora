# Feedback round 1 Implementation Plan

> **For agentic workers:** executed with the `codex-build` skill (Codex builds each task in a worktree, Astra reviews, Claude commits). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the six notes from the user's hands-on test: specific role and bullet questions with answer options, free talk as a fallback, voice transcript polish, and a cleaner CV page layout.

**Architecture:** The scorer (policy `score/3`) now also returns 1–3 role questions, and every question carries 3–4 options. `improve-bullet` returns the next specific question when a rewrite can't improve. The web focus session gains a role step before the bullets and up to 3 questions per bullet. Voice and page changes are local to their components.

**Tech Stack:** TypeScript, React + Vite (apps/web), Hono on Cloudflare Workers (apps/api), zod schemas in packages/shared, vitest.

**Spec:** `docs/superpowers/specs/2026-11-06-feedback-round-design.md`

**Branch / worktree:** `fix/feedback-round-1` in `../resumora-feedback-1`, one PR.

## Global Constraints

- Styles use the tokens in `apps/web/src/styles/tokens.css` only; no new colours.
- Options: 3–4 per question, each ≤ 60 characters; numbers only as ranges (`isAllowedOption` decides); a fixed "Something else" chip is always last.
- Max 3 role questions per role; max 3 questions per bullet per session.
- A bullet at 75+ counts as done.
- UI copy is English only (`apps/web/src/i18n/en.ts`, `en-enrich.ts`); sentence case.
- `prefers-reduced-motion`: no fade animations.
- Question topics, in priority order: tools, reporting line, leading people, who they worked with, processes, scope (ranges only), results. Role questions use only the first four.
- No new dependencies.

## Review Focus

1. A role with 0 bullets: the role step must still have questions (the scorer must run for it), and finishing them must create bullets, not a dead end.
2. A person who skips every role question and every bullet question: the session must end cleanly with no AI call made for skipped steps.
3. `nextQuestion` that repeats a question already asked in this session must be treated as null (move on), never shown twice.
4. A transcript delta made only of non-Latin characters must not add empty spaces or flicker the fade.
5. Old `cv_insights` rows under `score/2` must parse and be re-graded once, not crash the ScoreCard.

---

## Task 1: Voice box: no OpenAI line, Latin-only transcripts, fade-in

---
files: [apps/web/src/cv/enrich/useVoice.ts, apps/web/src/cv/enrich/AnswerBox.tsx, apps/web/src/cv/enrich/answer-box.test.tsx, apps/web/src/i18n/en.ts, apps/web/src/styles/enrich.css]
new_files: []
deps: false
size: 90
---

**Interfaces:**
- Produces: `export function latinOnly(text: string): string` in `useVoice.ts`.

- [ ] **Step 1: Write the failing tests** in `answer-box.test.tsx`:
  - `latinOnly("Am lucrat cu ăâîșț, 50%.")` → `"Am lucrat cu ăâîșț, 50%."`
  - `latinOnly("어 Yeah 비 helping")` → `"Yeah helping"` (no double or leading spaces)
  - `latinOnly("어 비")` → `""`
  - `AnswerBox` renders no text containing "OpenAI".
  - A live transcript delta renders its new words inside elements with class `voice-word-new`; with `matchMedia('(prefers-reduced-motion: reduce)')` true, no element has that class.
- [ ] **Step 2: Run** `codex-ask.ps1 -Test -Worktree <wt>`; expect these to fail.
- [ ] **Step 3: Implement.** `latinOnly` keeps characters in Unicode scripts `Latin`, `Common`, `Inherited` (regex with `\p{Script=…}` and the `u` flag), then collapses runs of spaces and trims. Apply it to every delta and every final transcript in `useVoice`; skip a delta that becomes empty. Remove the `enrich.voice.notice` key and its render. New words render in `<span class="voice-word-new">`, which fades opacity 0→1 over 300 ms in `enrich.css`; the class is not applied under reduced motion. Final text lands in the textarea as plain text, as today.
- [ ] **Step 4: Run tests**; expect PASS.
- [ ] **Step 5: Commit** `fix(voice): drop non-Latin noise, fade in words, remove provider notice`.

## Task 2: CV page: score pill beside the title, panel docked to the CV

---
files: [apps/web/src/cv/page/CvDocument.tsx, apps/web/src/cv/page/cv-document.test.tsx, apps/web/src/cv/enrich/ScorePill.tsx, apps/web/src/styles/cv-page.css, apps/web/src/styles/editor.css, apps/web/src/styles/panel.css, apps/web/src/cv/panel/SectionTools.tsx]
new_files: []
deps: false
size: 90
---

- [ ] **Step 1: Write the failing tests** in `cv-document.test.tsx`:
  - The role score pill for a role is a child of that role's heading row, rendered after the title element, with `aria-label="Role score 84"`.
  - The pill has the class `no-print`.
  - No element with the old gutter class remains.
- [ ] **Step 2: Run tests**; expect FAIL.
- [ ] **Step 3: Implement.** Move `ScorePill` into the heading row after the job title (green ≥ 75, marigold below, as `ScorePill` already colours). Add `@media print { .no-print { display: none } }` if not present. Layout in `editor.css`: one centred flex row = CV page, `gap: 24px`, panel `width: 340px`, `position: sticky`. In `panel.css`: body text 14 px, row padding 10 px. In `SectionTools`, the custom-section select gets its own full-width line with **Add section** below. Under 1100 px, leave the existing `BottomSheet` layout unchanged.
- [ ] **Step 4: Run tests**; expect PASS.
- [ ] **Step 5: Commit** `fix(cv-page): score pill beside the title; panel docked next to the CV`.

## Task 3: Scorer `score/3`: role questions and options on every question

---
files: [packages/shared/src/enrich.ts, packages/shared/src/enrich.test.ts, apps/api/src/enrich/prompts.ts, apps/api/src/enrich/score.ts, apps/api/src/enrich/score.test.ts, apps/api/src/enrich/fake-model.ts]
new_files: []
deps: false
size: 160
---

**Interfaces:**
- Produces (shared): `SCORE_POLICY = "score/3"`; `MAX_ROLE_QUESTIONS = 3`; `RoleQuestionSchema = { id: string, text: string, options: string[], kind: "role" }`; `RoleResult.roleQuestions: RoleQuestion[]` (zod `.default([])`); `ModelScoreSchema` gains `roleQuestions: { text, options }[]` (max 3).
- `buildRoleResult` filters role-question options with `isAllowedOption` and assigns ids `rq1..rq3`.

- [ ] **Step 1: Write the failing tests:**
  - shared: a stored `score/2` row without `roleQuestions` parses with `roleQuestions: []`.
  - shared: `buildRoleResult` keeps at most 3 role questions and drops an option `"Managed 37 people"` but keeps `"20+"`.
  - api: for a role with **0 bullets**, `scoreRole` calls the model and returns `roleQuestions` (fake model returns 2) with `score: null`; the result is stored.
  - api: the score system prompt contains the seven topics in the spec's order and the line "Role questions ask only about tools, reporting line, leading people and who they worked with."
  - api: the prompt asks for 3–4 options for every question and says "Never ask about something the CV or the notes already answer."
- [ ] **Step 2: Run tests**; expect FAIL.
- [ ] **Step 3: Implement.** Bump the policy, extend the schemas, add the topic table and the rules above to `scoreSystemPrompt`, and include the role's notes in `scoreUserMessage` if not already present. For 0 bullets, run the model with an empty bullet list (`maxOutputTokens` 600) instead of returning the cheap null result, and store it.
- [ ] **Step 4: Run tests**; expect PASS.
- [ ] **Step 5: Commit** `feat(enrich): score/3 with role questions and options on every question`.

## Task 4: API: `nextQuestion` from improve-bullet; brain dump from role answers

---
files: [packages/shared/src/enrich-focus.ts, apps/api/src/enrich/improve.ts, apps/api/src/enrich/improve.test.ts, apps/api/src/enrich/focus-prompts.ts, apps/api/src/enrich/brain-dump.ts, apps/api/src/enrich/brain-dump.test.ts, apps/api/src/enrich/routes.ts]
new_files: []
deps: false
size: 130
---

**Interfaces:**
- Consumes: `isAllowedOption`, `RoleResult.roleQuestions` (Task 3).
- Produces: `ImproveAnswer` needs-detail variant becomes `{ needsDetail: true, nextQuestion: { text: string, options: string[] } | null }`. `POST /v1/enrich/brain-dump` body gains `source: "ramble" | "answers"` (default `"ramble"`).

- [ ] **Step 1: Write the failing tests:**
  - improve: model returns `{ text: null, nextQuestion: { text: "Which tools did you use?", options: ["Excel", "SAP", "Something with 12 users"] } }` → response `nextQuestion.options` is `["Excel", "SAP"]`.
  - improve: a proposal that fails grading still returns the model's `nextQuestion`.
  - improve: a `nextQuestion` whose text equals (case-insensitive, trimmed) any note's question on the role → `nextQuestion: null`.
  - improve: a successful proposal returns no `nextQuestion` field.
  - brain-dump: `source: "answers"` with two role notes and no ramble note → proposals built; the user message contains both answers.
  - brain-dump: `source: "answers"` with no notes → 400 `no_answers`.
- [ ] **Step 2: Run tests**; expect FAIL.
- [ ] **Step 3: Implement.** `ImproveSchema` gains `nextQuestion: { text, options } | null`; the prompt asks the model to always return the one question for the most missing fact (topic priority from the spec), with 3–4 options. For `source: "answers"`, the brain dump input is the role's notes other than `BRAIN_DUMP_QUESTION`, newest 10, as `Q: … A: …` lines.
- [ ] **Step 4: Run tests**; expect PASS.
- [ ] **Step 5: Commit** `feat(enrich): specific follow-up questions; bullets from role answers`.

## Task 5: Web: role step first, up to 3 questions per bullet

---
files: [apps/web/src/cv/enrich/useFocusSession.ts, apps/web/src/cv/enrich/FocusMode.tsx, apps/web/src/cv/enrich/QuestionStep.tsx, apps/web/src/cv/enrich/enrich-api.ts, apps/web/src/cv/enrich/focus-session.test.tsx, apps/web/src/i18n/en.ts]
new_files: []
deps: false
size: 200
---

**Interfaces:**
- Consumes: `RoleResult.roleQuestions` (Task 3); `ImproveAnswer.nextQuestion`, brain-dump `source` (Task 4).
- Produces: session step `{ kind: "role", index: number }` before bullet steps; bullet state `asked: number` (1–3).

- [ ] **Step 1: Write the failing tests** in `focus-session.test.tsx`:
  - A role with 2 role questions opens on "About this role · 1 of 2"; answering saves a note via `setNote` and makes **no** AI call; then "About this role · 2 of 2"; then the first bullet.
  - Skipping every role question then every bullet ends the session with zero `improve-bullet` calls.
  - Needs-detail with `nextQuestion` shows that question and its option chips plus "Something else"; a third needs-detail on the same bullet moves to the next bullet.
  - Needs-detail with `nextQuestion: null` moves to the next bullet.
  - After **Use this**, a bullet whose new score is ≥ 75 moves to the next bullet.
  - A role with 1 bullet: after the role step, `brain-dump` is called with `source: "answers"` and the proposals step shows. A role with 0 bullets whose role questions were all skipped opens the free-talk screen.
  - The string "What else can you tell us about this?" appears nowhere in the rendered tree; key `enrich.focus.followUpQuestion` no longer exists in `en.ts`.
- [ ] **Step 2: Run tests**; expect FAIL.
- [ ] **Step 3: Implement.** Replace the `bullets.length <= 2` brain-dump opening with the order in the spec ("Order" section). `QuestionStep` renders role and bullet questions the same way, eyebrow `enrich.focus.roleEyebrow` = "About this role · {n} of {total}". Remove the free-text follow-up path.
- [ ] **Step 4: Run tests**; expect PASS.
- [ ] **Step 5: Commit** `feat(focus): role questions first, up to three specific questions per bullet`.

## Task 6: Web: free-talk link and role-aware free-talk screen

---
files: [apps/web/src/cv/enrich/QuestionStep.tsx, apps/web/src/cv/enrich/BrainDumpStep.tsx, apps/web/src/cv/enrich/useFocusSession.ts, apps/web/src/cv/enrich/focus-mode.test.tsx, apps/web/src/i18n/en.ts, apps/web/src/styles/focus.css]
new_files: []
deps: false
size: 80
---

**Interfaces:**
- Consumes: session steps from Task 5.

- [ ] **Step 1: Write the failing tests** in `focus-mode.test.tsx`:
  - Every role and bullet question shows the link "Questions not specific enough? Describe what you did there in your own words."; clicking it opens the free-talk screen; finishing or skipping it returns to the same place in the queue.
  - Free-talk heading for title "Global Market Developer", company "Kreditech" is "Tell us about your time as Global Market Developer at Kreditech"; with an empty company it is "Tell us about this role".
  - Starter chips read "What did you handle as Global Market Developer?", "Who relied on you at Kreditech?", "Anything you fixed or set up?", "Which tools did you use?" and do not fill the box when clicked.
  - "What did a normal week here look like?" appears nowhere.
- [ ] **Step 2: Run tests**; expect FAIL.
- [ ] **Step 3: Implement** with template strings in `en.ts` (no AI call). Keep `BRAIN_DUMP_QUESTION` (the stored note key) unchanged so old notes still match.
- [ ] **Step 4: Run tests**; expect PASS.
- [ ] **Step 5: Commit** `feat(focus): free talk as a fallback with a role-aware heading`.

## After all tasks

- [ ] Whole-branch Astra review (`codex-ask.ps1 -Review -Worktree <wt> -Base main -Brief docs/plans/2026-11-06-feedback-round-1.md`).
- [ ] Run the branch with `tools/dev-worktree.ps1 -Worktree resumora-feedback-1` and check each of the six notes in the browser with the user.
- [ ] Open the PR. Then propose the privacy-policy task as its own session.
