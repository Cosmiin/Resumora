# Projects: their own short flow (2026-11-16)

Built with `claude-build` on branch `feat/projects-flow`. Spec: `projects-design-2026-11-16.md` in the workspace folder (approved by the owner on 2026-11-16). Read it before any task: the questions table, the writer principles and the anti-goals are the heart of this work.

**Goal:** a project gets its own flow (up to 6 keyword-hunting questions, then one description sentence and at most two bullets, extra tools to Skills), leaves the role score, and is tailored only from what it already holds.

**Architecture:** two new API steps (`/v1/enrich/project-questions`, `/v1/enrich/project-write`) with their prompts in one file; a new web run (`ProjectRun` + `useProjectRun`) built from the existing `FocusBar`, `AnswerBox` and focus-screen styles; the role helpers keep their meaning for tailoring and the editor, and a new `gradedItems` drives every score.

## Global constraints (every task)

- Output of a project: `description` = one sentence, at most 25 words; `bullets` = at most 2.
- Only confirmed facts: a tool, number or result on the page comes from the project's own fields, its earlier lines or the person's answers. Never from the rest of the CV, never invented.
- No project score: projects never reach `/v1/enrich/score`, and the CV strength counts only roles and volunteering.
- Volunteering, the CV upload and the database are unchanged. No migration.
- Romanian lines of an ended project: "Am" + past participle; reuse `ROMANIAN_TENSE` and `NO_FIRST_PERSON` from `apps/api/src/enrich/prompts.ts`.
- Questions in the interface language (`questionLanguage`), lines in the CV language (`content.locale`), as in the role prompts.
- Never a leading question ("what does this project show that your jobs don't") and never a per-keyword question at tailoring.
- All texts in EN and RO.

## Review focus (inputs no task's main tests cover; each has a test in the owning task)

1. A project with no dates, or `current: true`: lines use the present only when current; the tense check runs only for `!current && endDate !== ""` (same rule as `brain-dump.ts`). → Task 3.
2. An imported project with 5 bullets: approval leaves exactly the (at most) 2 new bullets, not 7. → Task 4.
3. Every question skipped, and the project holds only a name: the writer returns no lines, and the run says there is nothing to write and changes nothing. → Tasks 3 and 4.
4. A ticked tool already in Skills (any group, any case): not added twice. → Task 3.
5. A Romanian CV with an English interface: questions in English, lines in Romanian. → Tasks 2 and 3.

---

## Task 1: Projects leave the score

Goal: no part of the app scores a project any more; the CV strength, the score list, the path's "below 80" list and the stored scores cover roles and volunteering only. The role helpers keep their meaning (tailoring and the editor still treat a project as role-shaped).

- Shared (`packages/shared/src/cv.ts`):
  - `gradedItems(cv): { item: Experience; kind: "role" | "volunteering" }[]` = `scoredItems(cv)` without projects, same order.
  - `findGraded(cv, id)` = `findScored` limited to those.
  - `projectDone(p: Project): boolean` = description has text and 1 or 2 bullets have text.
  - `scoredItems` / `findScored` / `ScoredKind` unchanged.
- API (`apps/api/src/enrich/score.ts`): the stale-row set uses `gradedItems` (a stored project row is removed on the next score call); a project id answers `400 not_scored` ("Projects aren't scored.") with no model call.
- Web: `useRoleScores`, `CvFacts`, `Overview` (`RoleScoreList`), and the strength in `EnrichPath` (`averageScore` inputs, `EndStop`) use `gradedItems`. The path's `below` list uses `gradedItems` (projects come back into the path in Task 5).

Acceptance tests:
- `gradedItems` on a CV with a role, a project and a volunteering item returns the role and the volunteering item, in that order; `projectDone` is true for description + 2 bullets, false for 3 bullets, false for an empty description, false for 0 bullets.
- `POST /v1/enrich/score` with a project id: 400 `not_scored`, the model is not called.
- A stored score row for a project is removed on the next score call.
- `CvFacts` on a CV with one role (score 70) and one project shows 70, and the "questions waiting" count ignores the project; a CV with only projects shows "–".

```
files: packages/shared/src/cv.ts, packages/shared/src/cv.test.ts, apps/api/src/enrich/score.ts, apps/api/src/enrich/score.test.ts, apps/web/src/cv/enrich/useRoleScores.ts, apps/web/src/cv/CvFacts.tsx, apps/web/src/cv/panel/Overview.tsx, apps/web/src/cv/enrich/EnrichPath.tsx, apps/web/src/cv/enrich/scores.test.tsx, apps/web/src/cv/enrich/enrich-path.test.tsx
new_files: none
deps: none
size: ~120 lines
```

## Task 2: Project questions (API)

Goal: `POST /v1/enrich/project-questions` returns up to 6 questions for one saved project, one per topic, each with suggested options to tick.

- Shared (new `packages/shared/src/projects.ts`, exported from `index.ts`):
  - `PROJECT_TOPICS = ["what", "tools", "connections", "part", "method", "outcome"] as const`, `ProjectTopic`.
  - `ProjectQuestionSchema = { id: string; topic: ProjectTopic; text: string (max 200); options: string[] (max 8, each max 60) }`.
  - `ProjectQuestionsBodySchema = { projectId: string (1–64) }` (strict); `ProjectQuestionsAnswerSchema = { questions: ProjectQuestion[] (max 6) }`.
- API, new `apps/api/src/enrich/project-prompts.ts`:
  - `projectQuestionsSystemPrompt(locale, questionLanguage)`: `languageInstruction` + the question principles of the spec (section "1. Questions"), the topics table with its example wordings, and the untrusted-data line used by `item-lines.ts`.
  - `projectQuestionsUserMessage(project, cv)`: the project (title, company, dates, current, description, bullets, url, its non-job notes as question/answer pairs) and, marked "context only, never a source of facts", the CV's role titles with their bullets and the three Skills lists.
- API, new `apps/api/src/enrich/project-questions.ts`: `projectQuestions(deps: ScoreDeps, input: ProjectQuestionsBody): Promise<ProjectQuestionsAnswer>`, `callModel` with task `"project_questions"`, tier `"cheap"`. After the call, in code: at most one question per topic, in `PROJECT_TOPICS` order; ids `pq1…`; options filtered with `isAllowedOption`, trimmed, deduplicated, max 8; questions over 200 characters dropped. A project id not in the saved CV: `409 not_saved` (same text as `item-lines.ts`). Model failure: `502 ai_failed` through `aiError`.
- Route in `apps/api/src/enrich/routes.ts` beside `/item-lines`, same shape (400 on a bad body, deps with `questionLanguage: c.get("interfaceLanguage")`).

Acceptance tests:
- The system prompt contains the six topics, "Options are suggestions to tick", "ranges" and the rule against asking about another project or job.
- The user message holds the project and its answered notes; the role context is marked "context only".
- Two "tools" questions from the model come back as one; 10 options come back as 8; an "Other" option is dropped.
- A Romanian CV with `questionLanguage: "en"`: the system prompt asks for questions in English (review focus 5).
- Unknown project id: 409; model throws: 502.

```
files: packages/shared/src/index.ts, apps/api/src/enrich/routes.ts, apps/api/src/enrich/routes.test.ts
new_files: packages/shared/src/projects.ts, packages/shared/src/projects.test.ts, apps/api/src/enrich/project-prompts.ts, apps/api/src/enrich/project-questions.ts, apps/api/src/enrich/project-questions.test.ts
deps: Task 1
size: ~250 lines
```

## Task 3: Project writer (API)

Goal: `POST /v1/enrich/project-write` turns one saved project and its answers (in its notes) into one description sentence, at most two bullets and the extra tools, passing the code checks.

- Shared (`projects.ts`): `ProjectWriteBodySchema = { projectId }` (strict); `ProjectWriteAnswerSchema = { description: string (max 200, may be ""); bullets: string[] (max 2, each max MAX_TEXT); extraTools: string[] (max 12, each max 60) }`.
- Prompt (`project-prompts.ts`): `projectWriteSystemPrompt(locale)` = `languageInstruction` + the writer principles of the spec (section "2. Writer"), `ROMANIAN_TENSE`, `NO_FIRST_PERSON`, "Return only JSON …"; `projectWriteUserMessage(project, cv)` with the same context block as Task 2 plus the instruction to lead with what the jobs and Skills don't show.
- `apps/api/src/enrich/project-write.ts`: `projectWrite(deps: ScoreDeps, input: ProjectWriteBody): Promise<ProjectWriteAnswer>`, task `"project_write"`, tier as `item-lines.ts`. Sources for the checks = the project's own text fields, its bullets and its non-job note answers (never the rest of the CV). Checks, in this order:
  1. a bullet naming a tool no source has (`unknownTools`, `apps/api/src/tailor/checks.ts`) or a number no source has (`hasUnknownNumber`): dropped; the same in the description empties it;
  2. ended project (`!current && endDate !== ""`) and a line `startsInPresentTense`: one retry with `pastTenseNote(locale)` added; still present after it: that line dropped;
  3. description cut to its first sentence and 200 characters; bullets cut to 2;
  4. `extraTools`: kept only when a source has it, it is not in the description or bullets, and no Skills group already has it (case-insensitive); deduplicated.
- Route beside Task 2's.

Acceptance tests:
- The system prompt contains "one sentence", "at most two", "Lead with", the Romanian rule and the no-first-person rule.
- A bullet with "Kubernetes" when no source has it is dropped; "4 hours a month" with no source number is dropped.
- Ended Romanian project, "Construiesc…" → retried with the Romanian note; current project → no retry; project with no end date → no retry (review focus 1).
- Model returns 3 bullets and a two-sentence description → 2 bullets, one sentence.
- `extraTools` ["Make", "zapier", "Notion"] with "Zapier" already in technical skills, "Make" in a bullet and "Notion" in no source → [] (review focus 4).
- A project with only a name and no answers, model returns nothing → `{ description: "", bullets: [], extraTools: [] }` (review focus 3).
- English interface, Romanian CV: the system prompt asks for lines in Romanian (review focus 5).

```
files: packages/shared/src/projects.ts, packages/shared/src/projects.test.ts, apps/api/src/enrich/project-prompts.ts, apps/api/src/enrich/routes.ts, apps/api/src/enrich/routes.test.ts
new_files: apps/api/src/enrich/project-write.ts, apps/api/src/enrich/project-write.test.ts
deps: Task 2
size: ~250 lines
```

## Task 4: The project run (web)

Goal: a focus screen that runs one project: start → its questions one per screen → writing → approval → done, opened from the project's ✨ button on the CV page.

- `enrich-api.ts`: `projectQuestions(projectId): Promise<ProjectQuestionsAnswer>`, `projectWrite(projectId): Promise<ProjectWriteAnswer>`.
- New `apps/web/src/cv/enrich/useProjectRun.ts` and `ProjectRun.tsx`, props like `RoleRun` without `scores`/`onScore`: `{ target: FocusTarget; cv; dispatch; waitForSave; onClose; context?; next? }`.
  - Steps: `start` (name, organisation · dates, "Up to 6 short questions"), `question` (`FocusBar` with the company from the reviewed change, eyebrow "Question n of N", `AnswerBox` with the question's options, Back / Skip / Next), `working`, `approve`, `empty` ("Nothing new to write from these answers." with Close), `failed` (Try again / Close), `done`.
  - Each answer is saved at Next with `setNote` (`roleId` = project id, `question`, `answer`, `via`, `askedAt`), as `useRoleRun` does; skipped questions save nothing. Before `projectWrite`, `await waitForSave()`.
  - Approval lists the new description and each bullet with Keep / Edit (owner's rule: inline confirm or edit), and "Added to Skills" with each tool as a chip that can be removed. Apply: `setItemField` description (when kept), a new reducer action `setProjectLines { itemId; texts: string[] }` that **replaces all bullets** with the kept ones (new ids), and `addSkills` (`group: "technicalSkills"`) for the kept tools.
- `cvReducer.ts`: `setProjectLines` (projects only; texts cut to 2).
- `Editor.tsx`: a focus target whose id is a project opens `ProjectRun`, not `RoleRun`.
- i18n EN and RO for every new text; styles reuse `focus.css` and the `rr-*` classes.

Acceptance tests:
- Opening a project from its ✨ shows the start screen; Start shows "Question 1 of 3" with the options as picks.
- Answering two and skipping one saves two notes on the project, then calls `projectWrite` after the save.
- Approval with 2 bullets on a project that had 5: after Apply the project has exactly the 2 kept bullets and the kept description (review focus 2); "Make" kept and "Zapier" removed adds only Make to technical skills.
- Writer returns empty → the "Nothing new" screen, CV unchanged (review focus 3).
- A role's ✨ still opens `RoleRun`.

```
files: apps/web/src/cv/enrich/enrich-api.ts, apps/web/src/cv/edit/cvReducer.ts, apps/web/src/cv/edit/cvReducer.test.ts, apps/web/src/cv/Editor.tsx, apps/web/src/i18n/en-basecv.ts, apps/web/src/i18n/ro-basecv.ts, apps/web/src/styles/focus.css
new_files: apps/web/src/cv/enrich/useProjectRun.ts, apps/web/src/cv/enrich/ProjectRun.tsx, apps/web/src/cv/enrich/project-run.test.tsx
deps: Task 3
size: ~350 lines
```

## Task 5: Projects in the guided path

Goal: the path's focus step lists projects with "To do" / "Done" instead of a score, and runs `ProjectRun` for each ticked project.

- `PathStart.tsx`: projects in their own group under the roles, each with "To do" or "Done" (`projectDone`); ticks start on every "to do" project (roles keep today's rule); an imported short project can still be ticked.
- `EnrichPath.tsx`: a stop that is a project renders `ProjectRun` with `context` ("Project 1 of 2", existing key `enrich.path.projectOf`) and `next`; the end screen counts done projects in its rows ("2 projects described") but not in the strength.
- `docs/redesign-log.md`: one entry for the projects flow (date, what changed, the owner's reasons).

Acceptance tests:
- Focus step with 2 roles and 2 projects (one done): the to-do project is ticked, the done one is not, neither shows a score.
- Starting the path with a project ticked reaches `ProjectRun` for it after the roles, with "Project 1 of 1" in the bar.
- The end screen's strength is the same with and without the project stop.

```
files: apps/web/src/cv/enrich/PathStart.tsx, apps/web/src/cv/enrich/EnrichPath.tsx, apps/web/src/cv/enrich/EnrichedScreen.tsx, apps/web/src/cv/enrich/enrich-path.test.tsx, apps/web/src/i18n/en-basecv.ts, apps/web/src/i18n/ro-basecv.ts, docs/redesign-log.md
new_files: none
deps: Task 4
size: ~180 lines
```

## Task 6: Tailoring a project

Goal: tailoring asks nothing about a project and rewords it toward the job only from what it holds, keeping at most two bullets.

- `apps/api/src/tailor/questions.ts`: when the item is a project (`findScored(cv, roleId)?.kind === "project"`), return `[]` before any model call. Volunteering unchanged.
- `apps/api/src/tailor/section-prompts.ts`: `SECTION_RULES.projects` states two rules by the item's `kind`: volunteering keeps today's text; a project follows the spec's section "5. Tailoring" (reword the description and at most two bullets toward the job's exact keywords; only its own lines, notes and answers; a keyword only when it is the same thing in other words or a direct part of what the person said, never a different tool; an unsupported keyword is left out; never more than two bullets; never change name, organisation, dates or link).
- Code check in the projects pass (where proposals are accepted, `section-pass.ts`): for a project, proposals beyond two bullet texts are dropped.

Acceptance tests:
- Tailoring questions for a project item: `[]`, model not called; for a volunteering item: model called as before.
- The projects section prompt contains "same thing in other words" and "never a different tool", and still contains the volunteering rule.
- A project pass returning 3 bullet proposals keeps 2.

```
files: apps/api/src/tailor/questions.ts, apps/api/src/tailor/section-prompts.ts, apps/api/src/tailor/section-pass.ts
new_files: apps/api/src/tailor/questions.test.ts, apps/api/src/tailor/section-pass.test.ts (no tests exist yet for these two files; build the deps the way checks.test.ts does)
deps: Task 1
size: ~100 lines
```

## After the tasks

- Whole-branch review (Opus high), then push and a PR; ask the owner about merging once it passes.
- Golden examples for the two new prompts: a few real projects, including the owner's agentic development project; run before merge and show the owner the outputs.
