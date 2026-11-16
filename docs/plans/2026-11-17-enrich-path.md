# Enrichment: one short path — Implementation Plan

> **For agentic workers:** build with the `claude-build` skill (owner's rule): test-first per task, a fresh review
> agent per task, commit per task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the guided "Enrich my CV" path with four steps (companies, tools, an 8-question budget across the
whole CV, one review sheet), remove the ✨ buttons, give projects an "Improve" button and give five sections a
"Suggest" action.

**Architecture:** Two new CV-wide model calls (companies, tools) and one pure ranking function (the budget, from the
stored role scores). The review sheet reuses today's per-role change preparation (`improveBullet`, `brainDump`,
`roleDescription`), lifted out of `useRoleRun` into a function both the role run and the new path call. Answers are
saved as role notes exactly as today, so scoring, facts and descriptions keep working unchanged.

**Tech Stack:** React + Vitest + Testing Library (apps/web), Hono on Workers (apps/api), zod (packages/shared).

**Spec:** `C:\Users\mcosm\claude\resumora\enrich-path-redesign-design-2026-11-17.md` (approved 17 Nov 2026).

**Branch:** `feat/enrich-path`, worktree `resumora-path`, base `feat/company-guess` (`e334072`, PR #66 not merged).
Rebase on `main` once PR #66 merges.

## Global Constraints

- Four steps, whatever the number of roles. The score shows only on the start screen and the end screen.
- A fact is asked once: company and tools never appear in the budget; a role sharing a company with another shares one answer.
- Every budget question shows its role on top: title · company · years, plus the line when it is about one.
- Lines fixed without asking: only lines with `score < CLEAR_AT` (80), any role; they add no facts.
- Nothing reaches the CV before "Apply all" on the review sheet.
- Budget size 8. Recent roles weigh more: `strengthWeights` (latest 3, the one before 2, the rest 1; volunteering 1).
- Unchanged: the "Answer" buttons, the score tips, the per-role `RoleRun`, the project flow's own steps.
- Every new string in `en-basecv.ts` and `ro-basecv.ts` (same keys), under `enrich.path.*`.
- No database migration. Notes stay within `MAX_NOTES` per role.

## Review Focus

1. A role with an empty company name: no row on the companies screen, no company note.
2. Two roles at "Carbon Global" and "carbon global srl": one row, one note saved on each role.
3. A CV where scores are still loading when Start is pressed: Start waits ("Checking your roles…"), never ranks on partial scores.
4. A budget with fewer than 8 candidates (strong CV): asks only those; with none, goes straight to the review sheet.
5. The model is unavailable for companies or tools: the step still shows (empty fields / CV-shown tools only) and can be continued.

---

## Task 1: Shared path helpers (company key, tools shown, budget ranking)
scope:
  files: [packages/shared/src/index.ts]
  new_files: [packages/shared/src/enrich-path.ts, packages/shared/src/enrich-path.test.ts]
  deps: []
  size: 220

**Interfaces — Produces:**
- `companyKey(name: string): string` — lower-case, spaces collapsed, trailing legal endings removed
  (`srl`, `s.r.l.`, `sa`, `inc`, `inc.`, `ltd`, `ltd.`, `llc`, `gmbh`, `ag`, `plc`, `corp`, `corp.`, `co.`), trimmed; `""` for a blank name.
- `CompaniesBodySchema` = `{}` (none); `CompaniesAnswerSchema` = `{ companies: { key: string; proposal: string | null }[] }` (max 40, proposal max `MAX_PROPOSAL`).
- `ToolsAnswerSchema` = `{ roles: { roleId: string; tools: string[] }[] }` (tools max 8 per role, each max 40 chars).
- `toolShown(role: Experience, tool: string): boolean` — case-insensitive whole-word match in title, description, bullets or note answers.
- `BudgetItem` = `{ roleId: string; kind: "role"; question: RoleQuestion } | { roleId: string; kind: "line"; question: Question }`.
- `pickBudget(input: { items: { id: string; result: RoleResult | undefined }[]; weights: ReadonlyMap<string, number>; asked: ReadonlySet<string>; size?: number }): BudgetItem[]`
  - candidates: each item's `roleQuestions` whose topic is not `company` or `tools`, and each `questions` entry;
  - skips any whose `questionKey(text)` is in `asked` (callers pass answered note questions and earlier rounds);
  - value: line = `(100 - bullet.score) * weight`; role question = `40 * weight` (weight default 1);
  - keeps the top `size` (default 8) by value (stable on ties, CV order), then orders them by the item's CV order, role questions before line questions within a role.
- `PATH_BUDGET = 8`.
- Move `questionKey(text: string): string` from `apps/web/src/cv/enrich/run.ts` into this file and re-export it from `run.ts`.

- [ ] **Step 1: Write the failing tests** in `enrich-path.test.ts`:
  - `companyKey("Carbon Global SRL") === companyKey(" carbon  global ")`, `companyKey("") === ""`, `companyKey("Robert Half Inc.") === "robert half"`.
  - `toolShown(role with bullet "Built reports in Power BI", "power bi") === true`; `"BI"` alone → false (whole word of the tool, not of a part); a note answer "Workday" counts.
  - `pickBudget`: never returns a `company` or `tools` topic; drops a question whose key is in `asked`; with weights 3/1 and equal gaps returns the weighted role's question first in value but output is CV-ordered; returns at most 8; returns `[]` when every item has no result; role questions precede line questions for the same role.
- [ ] **Step 2: Run** `npx vitest run src/enrich-path.test.ts` in `packages/shared` → FAIL (module missing).
- [ ] **Step 3: Implement** the functions and schemas above; export them from `index.ts`.
- [ ] **Step 4: Run** `npm test` and `npm run typecheck` from the repo root → PASS.
- [ ] **Step 5: Commit** "Shared helpers for the short enrichment path".

## Task 2: API — companies and tools for the whole CV
scope:
  files: [apps/api/src/enrich/routes.ts, apps/api/src/enrich/routes.test.ts]
  new_files: [apps/api/src/enrich/companies.ts, apps/api/src/enrich/companies.test.ts, apps/api/src/enrich/tools.ts, apps/api/src/enrich/tools.test.ts]
  deps: [1]
  size: 260

**Interfaces — Consumes:** `companyKey`, `CompaniesAnswerSchema`, `ToolsAnswerSchema`, `MAX_PROPOSAL`; `callModel`, `ScoreDeps`, `aiError` from `score.ts`; `gradedItems`.
**Produces:**
- `POST /v1/enrich/companies` → `CompaniesAnswer`. Handler `suggestCompanies(deps: ScoreDeps): Promise<CompaniesAnswer>`, task `enrich_companies`.
  - Sends one line per distinct `companyKey` among roles and volunteering with a non-empty company: `{ key, company, location, titles[] }` (context only).
  - System prompt: the company rule from `prompts.ts` (propose only for a company recognised and known for sure; generic, shared or unsure names → null; one plain sentence, at most 200 characters, in the question language). Reuse the same wording: lift it into an exported constant `COMPANY_RULE` in `prompts.ts` and use it in both prompts (scoring prompt text must stay byte-identical).
  - Drops any key the model returns that was not sent; trims proposals; blank → null.
  - No companies → `{ companies: [] }` with no model call.
- `POST /v1/enrich/tools` → `ToolsAnswer`. Handler `suggestTools(deps: ScoreDeps): Promise<ToolsAnswer>`, task `enrich_tools`.
  - Sends each role and volunteering item (id, title, company, period, bullets, note answers).
  - Prompt: for each role, up to 8 tools, software or methods the person likely used, those the role's text names first, then the usual ones for this kind of job; exact names; no soft skills.
  - Drops role ids not sent; dedupes case-insensitively; caps 8.
- Both map model failures through `aiError` (503 / 502).

- [ ] **Step 1: Write the failing tests** (`companies.test.ts`, `tools.test.ts`, with `fakeModel`, `roleWith`, `memoryCvRepo`):
  - two roles at "Carbon Global" and "Carbon Global SRL" → the request names that company once;
  - a returned unknown key is dropped; `"  "` proposal → null;
  - no companies → no request recorded, `{ companies: [] }`;
  - tools: an unknown roleId is dropped; `["Excel","excel","SAP"]` → `["Excel","SAP"]`;
  - `routes.test.ts`: both routes return 200 with the schema; a provider failure returns 503 `ai_unavailable`;
  - `score.test.ts` existing prompt tests still pass (scoring prompt unchanged).
- [ ] **Step 2: Run** `npx vitest run src/enrich` in `apps/api` → the new tests FAIL.
- [ ] **Step 3: Implement** `companies.ts`, `tools.ts`, the two routes, and `COMPANY_RULE`.
- [ ] **Step 4: Run** `npm test` and `npm run typecheck` → PASS.
- [ ] **Step 5: Commit** "API: companies and tools for the whole CV".

## Task 3: Lift role change preparation out of the role run
scope:
  files: [apps/web/src/cv/enrich/useRoleRun.ts, apps/web/src/cv/enrich/RoleRun.tsx]
  new_files: [apps/web/src/cv/enrich/prepare.ts, apps/web/src/cv/enrich/prepare.test.ts, apps/web/src/cv/enrich/ReviewPieces.tsx]
  deps: []
  size: 220

Pure refactor plus one option; `role-run.test.tsx` must pass unchanged.

**Interfaces — Produces:**
- `prepareRoleChanges(input: { cv: CvContent; roleId: string; result: RoleResult | undefined; answeredLines: ReadonlySet<string>; answeredRole: boolean; thinWithAnswers: boolean; describe: boolean }): Promise<{ changes: Change[]; failed: boolean }>`
  - the body of today's `finish` (useRoleRun.ts ~l.247): `improveBullet` for answered lines and for every other bullet with `score < CLEAR_AT`, `brainDump(source:"answers")` when `thinWithAnswers`, `roleDescription` when `describe`; at most 3 requests at once.
  - `useRoleRun` calls it; its current hold-early behaviour may stay inside the hook.
- `Change` type moves to `prepare.ts` (re-exported from `useRoleRun.ts`).
- `changeActions(roleId: string, list: ScoredList, decisions: { id: string; text: string }[]): CvAction[]` — today's apply mapping (description → `setItemField`, bullet → `replaceBullet`, new → one `addBullets`).
- `ReviewPieces.tsx` exports `Approve` and `Piece` moved from `RoleRun.tsx`; `Piece` gains an optional `tidied?: boolean` that shows the label `enrich.path.review.tidied` ("Tidied, no new facts").

- [ ] **Step 1: Write the failing tests** in `prepare.test.ts` (mock `./enrich-api.ts`): a bullet at 60 with no answer is sent to `improveBullet`; a bullet at 90 is not; `describe:false` makes no `roleDescription` call; one failing call returns `failed: true` with the other changes kept; `changeActions` maps the three kinds.
- [ ] **Step 2: Run** `npx vitest run src/cv/enrich/prepare.test.ts` in `apps/web` → FAIL.
- [ ] **Step 3: Implement** the move; `RoleRun` imports `Approve` from `ReviewPieces.tsx`.
- [ ] **Step 4: Run** `npm test` (all of `role-run.test.tsx` green, unchanged) and `npm run typecheck` → PASS.
- [ ] **Step 5: Commit** "Role change preparation is shared".

## Task 4: Companies and tools screens
scope:
  files: [apps/web/src/cv/enrich/enrich-api.ts, apps/web/src/i18n/en-basecv.ts, apps/web/src/i18n/ro-basecv.ts, apps/web/src/styles/focus.css]
  new_files: [apps/web/src/cv/enrich/CompaniesStep.tsx, apps/web/src/cv/enrich/ToolsStep.tsx, apps/web/src/cv/enrich/path-steps.test.tsx]
  deps: [1, 2]
  size: 300

**Interfaces — Consumes:** Task 1 helpers; Task 2 routes.
**Produces:**
- `enrich-api.ts`: `suggestCompanies(): Promise<CompaniesAnswer>`, `suggestTools(): Promise<ToolsAnswer>`.
- `CompaniesStep({ cv, onDone }: { cv: CvContent; onDone(notes: { roleId: string; note: Note }[]): void })`
  - rows grouped by `companyKey` over roles + volunteering in CV order; label "company · location"; empty keys skipped;
  - a row is done (shown with its answer, no input) when any of its roles has a note whose `questionKey` matches the company question, or a non-empty description;
  - proposal → sentence + ✓ (accept) / Edit (textarea prefilled); none → empty textarea; loading → rows show "…"; API failure → empty textareas;
  - "Confirm all and continue": one note per role of each non-done row with text — question `t("enrich.path.companies.note", { company })` ("What does {company} do?"), `via: ["pick"]` when accepted unchanged else `["type"]`. Rows left empty save nothing.
- `ToolsStep({ cv, onDone }: { cv; onDone(notes: { roleId: string; note: Note }[]): void })`
  - rows: roles + volunteering (title · company · years); columns: union of suggested tools, most-suggested first, at most 8 visible, "+ add" per row adds a column;
  - a cell is shown for a role when the tool is in its suggestions, or ticked on the role just before or after it; otherwise blank;
  - initially ticked where `toolShown(role, tool)`;
  - "Continue": for each role whose ticks differ from the initial ticks, a note with question `t("enrich.path.tools.note")` ("Which tools did you use?") and the ticked tools joined by ", "; `via: ["pick"]`.
- Note ids: `crypto.randomUUID()`; `askedAt` now.

- [ ] **Step 1: Write the failing tests** in `path-steps.test.tsx`: one row for two roles at the same company (case and "SRL" differ) and two notes on Confirm; ✓ on a proposal saves it with `via ["pick"]`; Edit saves the edited text with `["type"]`; a done company shows no input; API rejection still renders empty fields and Continue works; tools: a tool in a bullet starts ticked; unticking it and Continue saves a note without it; a tool added on row 2 shows a cell on rows 1 and 3 only; an unchanged row saves nothing.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `npm test`, `npm run typecheck` → PASS.
- [ ] **Step 5: Commit** "Companies and tools screens".

## Task 5: Budget questions and the review sheet
scope:
  files: [apps/web/src/i18n/en-basecv.ts, apps/web/src/i18n/ro-basecv.ts, apps/web/src/styles/focus.css]
  new_files: [apps/web/src/cv/enrich/BudgetStep.tsx, apps/web/src/cv/enrich/ReviewSheet.tsx, apps/web/src/cv/enrich/budget-review.test.tsx]
  deps: [1, 3]
  size: 320

**Interfaces — Consumes:** `BudgetItem`, `pickBudget` (Task 1); `prepareRoleChanges`, `changeActions`, `Piece` (Task 3); `AnswerBox`, `BrainDumpStep`.
**Produces:**
- `BudgetStep({ cv, items, onAnswer, onTalk, onDone }: { cv: CvContent; items: BudgetItem[]; onAnswer(item: BudgetItem, text: string, via: Via[]): void; onTalk(roleId: string, text: string, via: Via[]): void; onDone(): void })`
  - one question per screen; on top a role card: `title · company · formatRange(...)`, and for a line question the line in quotes; "Question {n} of {total}";
  - same answer box, Skip, Back as `RunQuestion`; a role-question with a `proposal` behaves as in `RunQuestion`;
  - "Rather just talk?" (`enrich.path.budget.talk`) opens `BrainDumpStep` for the shown role; sending calls `onTalk` and skips the rest of that role's items.
- `ReviewSheet({ cv, groups, busy, onApply }: { cv; groups: { roleId: string; changes: Change[]; tidied: ReadonlySet<string> }[]; busy: boolean; onApply(decisions: { roleId: string; id: string; text: string }[]): void })`
  - one group per role with changes, CV order, collapsed: "{title} · {company}: {n} changes" (`enrich.path.review.group`); click opens the role sheet with `Piece`s;
  - every change used unless "Keep mine"; "Apply all" sends all used decisions;
  - no groups → a line "Nothing to change" and a Continue button calling `onApply([])`.

- [ ] **Step 1: Write the failing tests** in `budget-review.test.tsx`: the role card shows title, company and years on a role question and also the line on a line question; Skip moves on without `onAnswer`; "Rather just talk?" then send calls `onTalk` and the next shown question belongs to another role; review groups start collapsed with the right count; Keep mine excludes that change from `onApply`; a tidied change shows "Tidied, no new facts"; empty groups show "Nothing to change".
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `npm test`, `npm run typecheck` → PASS.
- [ ] **Step 5: Commit** "Budget questions and the review sheet".

## Task 6: The new path
scope:
  files: [apps/web/src/cv/enrich/EnrichPath.tsx, apps/web/src/cv/enrich/enrich-path.test.tsx, apps/web/src/i18n/en-basecv.ts, apps/web/src/i18n/ro-basecv.ts]
  new_files: []
  deps: [3, 4, 5]
  size: 320

**Interfaces — Consumes:** Tasks 3–5; `strengthWeights`, `averageScore`, `ENRICHED_AVERAGE`, `EnrichedScreen`.
**Produces:** `EnrichPath` with the same props. `Stage` becomes `start | companies | tools | budget | preparing | review | end`.
- **start:** "Your CV: {n}" and "About 4 minutes: your companies, your tools, then the {k} questions that will help most." While any graded item is `scoring` or `none`, Start is disabled with "Checking your roles…". No role picking (`PathStart` no longer used by the path).
- **companies / tools:** dispatch each returned note with `setNote`, then `waitForSave()`, then next stage.
- **budget:** `pickBudget` over `gradedItems(cv)` with `strengthWeights(cv)`, `asked` = all note question keys plus questions asked in earlier rounds; 0 items → straight to preparing. Answers dispatch `setNote` (question text = the question's text); talk saves a note with `BRAIN_DUMP_QUESTION`.
- **preparing:** `waitForSave()`, then for each graded item: `answeredLines` = line items answered this round; `answeredRole` = any role item or talk answered this round; `describe` = a company or purpose answer was saved for it in this path and the role has no description, or it has one and got answers; `thinWithAnswers` = `result.thin` and answeredRole; skip a role with no answers and no bullet below `CLEAR_AT`. Changes from bullets the role had no answers about are marked `tidied`. Shows "Preparing your changes…".
- **review:** `ReviewSheet`; on apply dispatch `changeActions` per role, then end.
- **end:** "Your CV: {before} → {after}" from `averageScore` with `strengthWeights` (waits for rescoring as today's `EndStop`); buttons Done and "8 more questions" (`enrich.path.more`) which starts a new budget round (back to budget, earlier round's questions added to `asked`). `markEnriched` as today.
- Projects, light sections, achievements and skills stops are removed from the path.

- [ ] **Step 1: Rewrite `enrich-path.test.tsx`** (mock `CompaniesStep`, `ToolsStep`, `BudgetStep`, `ReviewSheet` as light stubs that call their callbacks; mock `./enrich-api.ts`): Start disabled while a role is scoring; the stages run in order companies → tools → budget → review → end; notes from steps reach the CV through `setNote`; a strong CV with no budget items goes from tools to review; review apply dispatches `replaceBullet`; end shows "62 → 80" style before/after; "8 more questions" returns to budget and does not repeat a question asked in the first round; no score number is rendered between start and end.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `npm test`, `npm run typecheck` → PASS.
- [ ] **Step 5: Commit** "The short enrichment path".

## Task 7: ✨ removed, project Improve button, Suggest on five sections
scope:
  files: [apps/web/src/cv/edit/BulletList.tsx, apps/web/src/cv/edit/sections/RoleItem.tsx, apps/web/src/cv/panel/SectionTools.tsx, apps/web/src/i18n/en-basecv.ts, apps/web/src/i18n/ro-basecv.ts]
  new_files: [apps/web/src/cv/enrich/SectionSuggest.tsx, apps/web/src/cv/enrich/section-suggest.test.tsx]
  deps: []
  size: 220

**Produces:**
- `BulletList`: no `ImproveButton`; delete `ImproveButton.tsx` and its tests' references.
- `RoleItem`: `DescribeProject` renders a text button "Improve" (`enrich.project.improve`) instead of ✨; same `open({ roleId, mode: "improve" })`.
- `AchievementsSuggest({ cv, dispatch, waitForSave })`: button "Suggest" (`enrich.path.suggest`) → `waitForSave()` → `suggestAchievements()` → `AchievementsPick` → `addAchievements`. Failure: `enrich.achievements.failed` line.
- `LightSuggest({ cv, dispatch, waitForSave, section, itemId })`: button "Suggest lines" → opens `LightStop` for that item with `onNext = onClose`.
- `SectionTools`: `key === "achievements"` → `AchievementsSuggest`; `LIGHT_SECTIONS.includes(key) && focus.itemId` → `LightSuggest`; base CV only (not tailored). Remove those keys' "coming next" placeholders.

- [ ] **Step 1: Write the failing tests** in `section-suggest.test.tsx`: no `improve-btn` in a bullet list; a project shows a button named "Improve" that opens the project target; achievements Suggest shows picks and adds the ticked ones; a course item's "Suggest lines" opens the "Tell us about" box; neither shows on a tailored CV.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `npm test`, `npm run typecheck` → PASS.
- [ ] **Step 5: Commit** "Sparkles removed; project Improve; Suggest on five sections".

## End of part
Tasks 1–4 in one session, 5–7 in a fresh one (claude-build: after 4 tasks). Whole-branch review on Opus, push,
draft PR based on `feat/company-guess`. Check in the browser on the local stack (`tools/dev-worktree.ps1`): a CV
with two roles at one company, the four steps, Apply all, the end score.
