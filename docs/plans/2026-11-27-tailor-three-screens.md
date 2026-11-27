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

The new screens are built and tested on their own first (B1 to B3), then wired into the flow in one step that also removes the old screens (B4). Until B4 the site keeps the old flow.

### Task B1: The questions screen
```
files: apps/web/src/tailor/tailor-api.ts, apps/web/src/i18n/en-tailor.ts, apps/web/src/i18n/ro-tailor.ts, apps/web/src/styles/tailor.css
new_files: apps/web/src/tailor/GapQuestions.tsx, apps/web/src/tailor/gap-questions.test.tsx
deps: A3
size: ~120 lines
```
**Goal.** `GapQuestions`: one screen titled by how many things the job asks that the CV doesn't show. One row per question: the question, the CV's own words when a role hints at it, the roles as chips (the hinted ones first and marked "your CV hints at this", never ticked for the person: a tick is their own statement), "No, but I used something similar" and "No" as one-tap answers. A row opens with 3 roles (or all the hinted ones), the rest behind "N more roles"; a ticked role is always in sight. The first 6 rows show, the rest behind "Show N more". One button, "Tailor my CV", enabled unless the answers are being sent. It gives one answer per question: the ticked roles in CV order, a one-tap no, or a skip for a row left untouched. It opens with answers given before. `tailor-api.ts` gains `askGaps`, `writeStep` and `finishRun` for the routes of Part A.

**Acceptance tests** (`gap-questions.test.tsx`). The rows, their chips and the hint, with nothing ticked; what is sent for ticks, a one-tap no and an untouched row; a no clears the ticks and a tick clears the no; "Show N more" and "N more roles"; the stored answers on opening and the button disabled while busy; the title for one gap.

### Task B2: One wait
```
files: none
new_files: apps/web/src/tailor/run-all.ts, apps/web/src/tailor/run-all.test.ts
deps: A1, A2, B1
size: ~50 lines
```
**Goal.** `stepsOf(run, cv)`: every role, project and volunteering role of the run still in the CV, then its other sections, without the layout step. `runAll(api, run, cv, onProgress, atOnce = 6)`: writes those steps with at most `atOnce` requests in flight, then the layout step (when the run has one), then finishes the run; reports progress after each step. A step that fails is tried once more; one that fails twice is returned in `failed` and the run still finishes. A deleted job or a replaced Base CV (`job_not_found`, `base_cv_changed`) stops it at once and is thrown.

**Acceptance tests** (`run-all.test.ts`). The steps of a run; the limit on requests in flight, the layout step after the others, one finish, the progress counts; the retry and the step that fails twice; the two errors that stop it; a run without a layout step.

### Task B3: The final page
```
files: apps/api/src/tailor/accept.ts, apps/api/src/tailor/write-step.ts, apps/api/src/tailor/review-item.ts, apps/api/test/tailor-write-step.test.ts, apps/api/test/tailor-review-item.test.ts, apps/web/src/tailor/DoneScreen.tsx, apps/web/src/tailor/done-screen.test.tsx, apps/web/src/i18n/en-tailor.ts, apps/web/src/i18n/ro-tailor.ts, apps/web/src/styles/tailor.css
new_files: apps/web/src/tailor/ChangesList.tsx, apps/web/src/tailor/changes-list.test.tsx
deps: A1
size: ~220 lines
```
**Goal.**
- API: the layout step written with `steps/write` does not apply its headline: the proposal is stored in the review state as not kept, for the person to choose. `PATCH /v1/tailored/:id/review` learns two keys of the `layout` section: `headline` (keep = the proposed headline becomes the first title; remove = the Base titles come back) and `layout` (remove = the Base section order comes back; keep = the proposed order again). A headline that holds one of the CV's other titles drops that title, wherever a headline is applied (27 Nov: "Business Analyst and Solution Architect · Solution Architect").
- Web, `ChangesList`: from the tailored CV and its review state, every kept change with its wording before (from the Base snapshot) and after, grouped by role or section, each with "Undo" (the Base wording comes back; the row then reads "Kept your wording"); added skills with "Remove"; the section order, when it changed, with "Keep mine"; the proposed headline with "Use this headline" and "Keep mine"; one line naming the parts left unchanged. An undo that fails says so and leaves the row as it was.
- Web, `DoneScreen`: shows the list under the score cards, and the download buttons (PDF and Word, in the CV's saved template, with a link to change the template) instead of the link to the download page. The "N AI guesses not checked" notice stays for older tailored CVs.

**Acceptance tests.** API: a layout write leaves the titles as they were and stores the headline as not kept; keep and remove for `headline` and for `layout`; the doubled title is dropped. Web: the list from a review state (changed line, new skill, order, headline, unchanged parts); Undo calls the review route and marks the row; a failed undo; the headline's two choices; the download buttons call the export with the saved template.

**Rulings made while building.**
- `apps/api/src/tailor/layout-pass.ts` is touched too: a layout step written with `steps/write` starts from the Base order and titles (so writing it twice gives the same CV, and a headline picked earlier is not built on), and its proposals are compared with the Base order and headline for the same reason.
- `PATCH /v1/tailored/:id/review` also learns `order` and `hide:<id>` of the lighter sections (achievements, courses, publications, interests): remove puts the Base order back, or shows the item again. Without it those applied changes would have no Undo on the final page. An order or a hidden item cannot be edited (400).
- The API tests for the review route live in `apps/api/test/tailor-write-step.test.ts` (there is no `tailor-review-item.test.ts`).
- `GapQuestions` used the class `tailor-gap`, which the final page already uses for spacing; its rows are `tailor-gaprow` now.
- After an undo or a headline choice on the final page, one line says the match shown is from before that change and links to the job page, where it can be checked again.
- `DoneScreen` takes `failed` (the parts that could not be tailored) and names them; B4 passes it.

### Task B4: The flow uses the new screens, and the old ones go
```
files: apps/web/src/tailor/TailorFlow.tsx, apps/web/src/tailor/flow-phase.ts, apps/web/src/tailor/Working.tsx, apps/web/src/tailor/Room.tsx, the review and question screens the flow no longer opens with their tests, apps/web/src/i18n/en-tailor.ts, apps/web/src/i18n/ro-tailor.ts, apps/web/src/styles/tailor.css
new_files: apps/web/src/tailor/three-screens.test.tsx
deps: B1 to B3
size: ~150 lines added, far more removed
```
**Goal.** `/jobs/:id/tailor`: starts (or continues) the run; asks the gap questions once and shows `GapQuestions` (skipped when there is no gap, or when every question already has an answer); sends the answers; one wait with its progress ("Tailoring 5 of 12 parts") while `runAll` works; then the final page, which names any part that could not be tailored. A run already done opens on the final page. A run left during the wait runs the wait again when opened (writing a step twice gives the same CV). The bar keeps the job's name, the match, the language choice (until the answers are sent) and Adjust; the left-hand map, the per-role questions, the per-step waits and the per-section review screens are no longer reachable, and code only they used is deleted with its tests. "Change my answers" on the final page opens the questions screen with the answers given; sending them runs the wait again.

**Acceptance tests** (`three-screens.test.tsx`). Start → questions → answers sent → every step written → finish → the final page; no gap: straight to the wait; a done run: the final page with no request to write; a failed part named on the final page; a deleted job; changing the answers from the final page.

## Order and checks
A1 → A2 → A3 (PR 99, live, unused by the site) → B1 → B2 → B3 → B4 (one PR, live). After Part B the owner tailors the same job once more.
