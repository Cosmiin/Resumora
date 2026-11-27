# Tailoring in three screens: build plan (steps 2 to 4)

Design: `tailor-three-screens-design-2026-11-27.md`. Step 1 (the writing aims only at gaps, never guesses in a role) is live since PR 97. The owner's two re-run notes are in their own plan (`2026-11-27-tailor-rerun-notes.md`).

Goal: one screen with every question, one wait, one final page. Two parts, each its own PR. Part A changes only the API and is not used by the site until Part B, so it can go live on its own.

## How the one wait works (the main technical choice)

Today every step is its own request, in a fixed order, and each rewrites the run's whole list of proposals and scores the CV. Two steps at once would overwrite each other.

The new way keeps "one request per step" (so no request runs long and none needs many model calls) but makes each step write straight into the tailored CV with a version check, retrying when another step saved first. The site then fires all the steps at once and calls one last request that scores the CV once. No database change and no queue.

Order inside the wait: every role, project, the skills, the summary and the small sections together; then the headline and section order (it reads the tailored text); then the score.

## Part A: the API can run every step at once

### Task A1: A step can be written straight into the tailored CV
```
files: apps/api/src/tailor/accept.ts, apps/api/src/tailor/section-pass.ts, apps/api/src/tailor/layout-pass.ts, apps/api/src/tailor/routes.ts, apps/api/test/tailor-accept.test.ts
new_files: apps/api/src/tailor/write-step.ts, apps/api/test/tailor-write-step.test.ts
deps: none
size: ~120 lines
```
**Goal.** `POST /v1/tailor-runs/:id/steps/write` with `{ section, roleId? }`:
- works for any section of the run (and any of its roles) while the run is not done, whatever the run's current step;
- makes the step's proposals as today (`passProposals`; the layout step's own pass for `layout`), keeps the ones that pass the checks, and applies them to the tailored CV with the same rules as accept (kept unless flagged, the "a change must not drop met evidence" floor, the small sections rebuilt from the Base CV, the review state written per item);
- saves with the tailored CV's version; on a conflict it reads the CV again, applies again and saves again, up to 5 times, then answers 409;
- does not score, does not change the run, marks the tailored CV's score as stale;
- answers `{ changed, removed }`.
The existing run and accept routes behave as before.

**Acceptance tests.** Two role writes started together both end up in the tailored CV (a repo that reports one conflict); a write for a role that is not the run's current role works; a done run answers 409; the layout write reads the tailored headline; nothing is scored (no `tailor_score` call) and the run's current step is unchanged; an unknown role answers 409.

### Task A2: One request finishes the run and scores once
```
files: apps/api/src/tailor/routes.ts, apps/api/src/tailor/write-step.ts, apps/api/test/tailor-write-step.test.ts
new_files: none
deps: A1
size: ~40 lines
```
**Goal.** `POST /v1/tailor-runs/:id/finish`: scores the tailored CV as it stands (one `tailor_score` call), saves the score, clears the stale mark, sets the run done. Calling it again returns the same result without scoring again. Answers `{ run, score }`.

**Acceptance tests.** One score call; the run is done and has no current step; the second call makes no model call; a run of another user answers 404; when the score cannot be worked out the run stays open.

### Task A3: One request asks about every gap, with the roles it may fit
```
files: apps/api/src/tailor/questions.ts, apps/api/src/tailor/question-prompts.ts, apps/api/src/tailor/routes.ts, packages/shared/src/tailor.ts, apps/api/test/tailor-questions.test.ts
new_files: none
deps: none
size: ~90 lines
```
**Goal.** `POST /v1/tailor-runs/:id/gap-questions`: one model call that returns one question per open gap (missing, partial or only hinted), asked once for all roles as today's all-roles questions are, at most 12, most useful first. New on each question: `suggestedRoleIds` (the roles whose own lines hint at it) and `hint` (the words of the CV that hint at it, quoted; checked to stand in that role). A gap no role could have had (a tool newer than every role) is left out. Stored on the run with scope "all", so the answers work as today (a note on each role ticked) and no later step asks again. A CV with a single role is asked too. One answers request takes up to 12 answers.
Asked once per run: a second call returns the stored questions.

**Acceptance tests.** Every open gap gets a question, a met one none; a hint that is not in the suggested role's text is dropped with its suggestion; ids of roles the CV doesn't have are dropped; the second call returns the stored questions with no model call; a ticked role gets its note; a CV with one role is asked; 12 answers go through in one request; the old all-roles route still works.

## Part B: the site shows three screens

### Task B1: The questions screen
```
files: apps/web/src/tailor/TailorFlow.tsx, apps/web/src/tailor/tailor-api.ts, apps/web/src/i18n/en-tailor.ts, apps/web/src/i18n/ro-tailor.ts, apps/web/src/styles/tailor.css
new_files: apps/web/src/tailor/GapQuestions.tsx, apps/web/src/tailor/gap-questions.test.tsx
deps: A3
size: ~150 lines
```
**Goal.** One screen titled by how many things the job asks that the CV doesn't show. One row per question: its short name, the hint when there is one, the roles as chips with the suggested ones first and marked "your CV hints at this" (never ticked for the person: a tick is their own statement), "No, but I used something similar" and "No". The first 6 rows show; the rest sit under "Show more". One button, "Tailor my CV", always enabled: a row left untouched counts as skipped. No gap at all: the screen is skipped.

### Task B2: One wait
```
files: apps/web/src/tailor/TailorFlow.tsx, apps/web/src/tailor/tailor-api.ts, apps/web/src/tailor/Working.tsx, apps/web/src/i18n/en-tailor.ts, apps/web/src/i18n/ro-tailor.ts
new_files: apps/web/src/tailor/run-all.ts, apps/web/src/tailor/run-all.test.ts
deps: A1, A2
size: ~110 lines
```
**Goal.** After the answers are sent, the site writes every step at once (at most 6 requests at a time), then the layout step, then finishes the run. One screen says what is happening ("Tailoring 5 of 12 parts"). A step that fails is tried once more; if it fails again the run still finishes and the final page names the part that stayed as it was. Leaving and coming back continues from the steps not yet written.

### Task B3: The final page
```
files: apps/web/src/tailor/DoneScreen.tsx, apps/web/src/tailor/TailorFlow.tsx, apps/web/src/tailor/tailored-api.ts, apps/web/src/i18n/en-tailor.ts, apps/web/src/i18n/ro-tailor.ts, apps/web/src/styles/tailor.css, apps/api/src/tailor/accept.ts
new_files: apps/web/src/tailor/ChangesList.tsx, apps/web/src/tailor/changes-list.test.tsx
deps: B2
size: ~180 lines
```
**Goal.** The result screen also shows: every changed line with its wording before and after and an "Undo" (the Base wording comes back; "Redo" puts the change back); added and renamed skills, each with "Remove"; the section order with "Keep mine"; the headline as a choice the person makes ("Use this headline" / "Keep mine"), not applied until chosen; one line naming what was left unchanged; the template choice and the download buttons. A headline that would repeat one of the CV's other titles drops that title (27 Nov: "Business Analyst and Solution Architect · Solution Architect").

### Task B4: The old screens go
```
files: apps/web/src/tailor/TailorFlow.tsx, apps/web/src/tailor/Room.tsx and the review screens it no longer opens, their tests, the i18n files
deps: B1 to B3
size: removal
```
**Goal.** The per-role questions, the per-step waits, the per-section review screens and the left-hand map are no longer reachable from tailoring; code only they used is deleted. "Change my answers" opens the questions screen again and re-runs only the roles whose answers changed.

## Order and checks
A1 → A2 → A3 (PR, live, unused by the site) → B1 → B2 → B3 → B4 (PR, live). After Part B the owner tailors the same job once more.
